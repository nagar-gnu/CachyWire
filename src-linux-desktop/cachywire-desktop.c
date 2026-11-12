/**
 * CachyWire Network Security (v0.1.0-alpha) — Native CachyOS / Arch Linux Desktop Shell
 * Built with GTK3 + WebKit2GTK 4.1 + Ayatana AppIndicator3 (System Tray Next to Clock)
 *
 * Features:
 *  - Native Main Desktop Window (1280x820, min 960x640)
 *  - Persistent System Tray Icon (Ayatana AppIndicator3 / StatusNotifierItem) next to clock
 *  - Automatic background telemetry service management (cachywire-daemon on 127.0.0.1:8080)
 *  - Bi-directional IPC bridge via window.webkit.messageHandlers.cachywire.postMessage()
 */

#define _GNU_SOURCE
#include <gtk/gtk.h>
#include <gio/gio.h>
#include <webkit2/webkit2.h>
#include <libdbusmenu-glib/server.h>
#include <libdbusmenu-gtk/parser.h>
#include <JavaScriptCore/JavaScript.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <signal.h>
#include <sys/types.h>
#include <sys/wait.h>
#include <sys/resource.h>
#include <sys/socket.h>
#include <netinet/in.h>
#include <arpa/inet.h>
#include <libgen.h>
#include <limits.h>

static GtkWidget *main_window = NULL;
static GtkWidget *main_webview = NULL;
static DbusmenuServer *tray_menu_server = NULL;
static GtkWidget *tray_gtk_menu = NULL;
static char tray_icon_dir[PATH_MAX + 32] = "";
static pid_t server_pid = -1;
static gboolean is_quitting = FALSE;
static gboolean is_maximized = FALSE;
static char app_root_dir[PATH_MAX] = "/opt/cachywire";

#define GW_PORT 8080
#define GW_MAIN_URL "http://127.0.0.1:8080/index.html"

/* Check if TCP port 8080 on 127.0.0.1 is already accepting connections */
static gboolean is_server_running(void) {
    int sock = socket(AF_INET, SOCK_STREAM, 0);
    if (sock < 0) return FALSE;

    struct sockaddr_in addr;
    memset(&addr, 0, sizeof(addr));
    addr.sin_family = AF_INET;
    addr.sin_port = htons(GW_PORT);
    inet_pton(AF_INET, "127.0.0.1", &addr.sin_addr);

    int res = connect(sock, (struct sockaddr *)&addr, sizeof(addr));
    close(sock);
    return (res == 0);
}

/* Resolve the application root directory containing index.html */
static void resolve_app_root(void) {
    const char *env_dir = getenv("CACHYWIRE_APP_DIR");
    if (env_dir && env_dir[0] != '\0') {
        char candidate[PATH_MAX + 32];
        snprintf(candidate, sizeof(candidate), "%s/index.html", env_dir);
        if (access(candidate, R_OK) == 0) {
            snprintf(app_root_dir, sizeof(app_root_dir), "%s", env_dir);
            return;
        }
    }

    char exe_path[PATH_MAX];
    ssize_t len = readlink("/proc/self/exe", exe_path, sizeof(exe_path) - 1);
    if (len > 0) {
        exe_path[len] = '\0';
        char *dir = dirname(exe_path);
        char candidate[PATH_MAX + 32];
        snprintf(candidate, sizeof(candidate), "%s/index.html", dir);
        if (access(candidate, R_OK) == 0) {
            snprintf(app_root_dir, sizeof(app_root_dir), "%s", dir);
            return;
        }
    }

    char cwd[PATH_MAX];
    if (getcwd(cwd, sizeof(cwd)) != NULL) {
        char candidate[PATH_MAX + 32];
        snprintf(candidate, sizeof(candidate), "%s/index.html", cwd);
        if (access(candidate, R_OK) == 0) {
            snprintf(app_root_dir, sizeof(app_root_dir), "%s", cwd);
            return;
        }
    }
}

/* Spawn ultra-lightweight native Rust backend (cachywire-daemon) */
static void ensure_backend_server(void) {
    if (is_server_running()) {
        return;
    }

    pid_t pid = fork();
    if (pid == 0) {
        if (chdir(app_root_dir) != 0) {
            _exit(1);
        }
        setenv("CACHYWIRE_APP_DIR", app_root_dir, 1);
        FILE *f1 = freopen("/tmp/cachywire-backend.log", "a", stdout);
        FILE *f2 = freopen("/tmp/cachywire-backend.log", "a", stderr);
        (void)f1; (void)f2;

        char rust_bin_local[PATH_MAX + 64];
        snprintf(rust_bin_local, sizeof(rust_bin_local), "%s/cachywire-daemon", app_root_dir);
        if (access(rust_bin_local, X_OK) == 0) {
            execl(rust_bin_local, "cachywire-daemon", (char *)NULL);
        }
        const char *xdg = getenv("XDG_RUNTIME_DIR");
        if (xdg && xdg[0] != '\0') {
            char xdg_daemon[PATH_MAX + 64];
            snprintf(xdg_daemon, sizeof(xdg_daemon), "%s/cachywire/cachywire-daemon", xdg);
            if (access(xdg_daemon, X_OK) == 0) {
                execl(xdg_daemon, "cachywire-daemon", (char *)NULL);
            }
        }
        if (access("/opt/cachywire/cachywire-daemon", X_OK) == 0) {
            execl("/opt/cachywire/cachywire-daemon", "cachywire-daemon", (char *)NULL);
        }
        if (access("/tmp/cachywire-bin/cachywire-daemon", X_OK) == 0) {
            execl("/tmp/cachywire-bin/cachywire-daemon", "cachywire-daemon", (char *)NULL);
        }

        fprintf(stderr, "[ERROR] cachywire-daemon not found in %s or /opt/cachywire\n", app_root_dir);
        _exit(1);
    } else if (pid > 0) {
        server_pid = pid;
        for (int i = 0; i < 30; i++) {
            if (is_server_running()) break;
            usleep(100000);
        }
    }
}

/* Cleanly stop spawned backend server on application quit */
static void stop_backend_server(void) {
    if (server_pid > 0) {
        kill(server_pid, SIGTERM);
        // Wait up to 1 second for graceful exit, then force kill if still running
        for (int i = 0; i < 10; i++) {
            usleep(100000);
            int status;
            if (waitpid(server_pid, &status, WNOHANG) > 0) {
                server_pid = -1;
                return;
            }
        }
        kill(server_pid, SIGKILL);
        waitpid(server_pid, NULL, 0);
        server_pid = -1;
    }
}

/* Execute JavaScript in the main window WebView */
static void run_main_js(const char *script) {
    if (main_webview && WEBKIT_IS_WEB_VIEW(main_webview)) {
        webkit_web_view_evaluate_javascript(
            WEBKIT_WEB_VIEW(main_webview),
            script, -1, NULL, NULL, NULL, NULL, NULL
        );
    }
}

static void on_script_message_received(WebKitUserContentManager *manager,
                                       WebKitJavascriptResult *js_result,
                                       gpointer user_data);

/* Wayland xdg-activation token handed to us by KDE Plasma right before Activate() */
static gchar *pending_activation_token = NULL;

/* Restore and focus the Main Dashboard Window */
static void restore_main_window(void) {
    if (main_window) {
        gtk_widget_show_all(main_window);
        gtk_window_deiconify(GTK_WINDOW(main_window));
        if (pending_activation_token) {
            /* GTK3 on Wayland uses the startup id as the xdg-activation token,
             * which lets KWin raise and focus an already-open window. */
            gtk_window_set_startup_id(GTK_WINDOW(main_window), pending_activation_token);
            g_free(pending_activation_token);
            pending_activation_token = NULL;
        }
        gtk_window_present_with_time(GTK_WINDOW(main_window), GDK_CURRENT_TIME);
    }
}

/* Handle IPC messages from window.webkit.messageHandlers.cachywire.postMessage(cmd) */
static void on_script_message_received(WebKitUserContentManager *manager,
                                       WebKitJavascriptResult *js_result,
                                       gpointer user_data) {
    (void)manager;
    (void)user_data;

    JSCValue *value = webkit_javascript_result_get_js_value(js_result);
    if (!jsc_value_is_string(value)) return;

    char *cmd = jsc_value_to_string(value);
    if (!cmd) return;

    if (strstr(cmd, "restore_main") != NULL) {
        restore_main_window();
    } else if (strstr(cmd, "minimize_window") != NULL) {
        if (main_window) gtk_window_iconify(GTK_WINDOW(main_window));
    } else if (strstr(cmd, "maximize_window") != NULL) {
        if (main_window) {
            if (is_maximized) {
                gtk_window_unmaximize(GTK_WINDOW(main_window));
                is_maximized = FALSE;
            } else {
                gtk_window_maximize(GTK_WINDOW(main_window));
                is_maximized = TRUE;
            }
        }
    } else if (strstr(cmd, "minimize_to_tray") != NULL) {
        if (main_window) {
            gtk_widget_hide(main_window);
        }
    }

    g_free(cmd);
}

/* Intercept window close button (X) to keep CachyWire running in System Tray next to clock */
static gboolean on_main_window_delete_event(GtkWidget *widget, GdkEvent *event, gpointer user_data) {
    (void)event;
    (void)user_data;

    if (is_quitting) {
        return FALSE;
    }

    gtk_widget_hide(widget);
    return TRUE;
}

/* Tray Menu Callbacks */
static void on_tray_open_dashboard(GtkMenuItem *item, gpointer user_data) {
    (void)item; (void)user_data;
    restore_main_window();
}

static void on_tray_clear_all_data(GtkMenuItem *item, gpointer user_data) {
    (void)item; (void)user_data;
    restore_main_window();
    run_main_js("if(window.gwApp){window.gwApp.clearAllRecordedData();}");
}

static void on_tray_fw_click_to_block(GtkMenuItem *item, gpointer user_data) {
    (void)item; (void)user_data;
    restore_main_window();
    run_main_js("if(window.gwApp){window.gwApp.shell.switchView('firewall');window.gwApp.firewallView._setMode('CLICK_TO_BLOCK');}");
}

static void on_tray_fw_ask_to_connect(GtkMenuItem *item, gpointer user_data) {
    (void)item; (void)user_data;
    restore_main_window();
    run_main_js("if(window.gwApp){window.gwApp.shell.switchView('firewall');window.gwApp.firewallView._setMode('ASK_TO_CONNECT');}");
}

static void on_tray_fw_block_all(GtkMenuItem *item, gpointer user_data) {
    (void)item; (void)user_data;
    restore_main_window();
    run_main_js("if(window.gwApp){window.gwApp.shell.switchView('firewall');window.gwApp.firewallView._setMode('BLOCK_ALL');}");
}

static void on_tray_toggle_incognito(GtkMenuItem *item, gpointer user_data) {
    (void)item; (void)user_data;
    run_main_js("if(window.gwApp){window.gwApp.toggleIncognito();}");
}

static void on_tray_toggle_snooze(GtkMenuItem *item, gpointer user_data) {
    (void)item; (void)user_data;
    run_main_js("if(window.gwApp){window.gwApp.toggleSnooze();}");
}

static void on_tray_quit(GtkMenuItem *item, gpointer user_data) {
    (void)item; (void)user_data;
    is_quitting = TRUE;
    stop_backend_server();
    gtk_main_quit();
}

/* KDE / Freedesktop StatusNotifierItem XML Introspection (ItemIsMenu = FALSE so Left-Click triggers Activate!) */
static const gchar sni_introspection_xml[] =
    "<node>"
    "  <interface name='org.kde.StatusNotifierItem'>"
    "    <method name='ContextMenu'>"
    "      <arg name='x' type='i' direction='in'/>"
    "      <arg name='y' type='i' direction='in'/>"
    "    </method>"
    "    <method name='Activate'>"
    "      <arg name='x' type='i' direction='in'/>"
    "      <arg name='y' type='i' direction='in'/>"
    "    </method>"
    "    <method name='SecondaryActivate'>"
    "      <arg name='x' type='i' direction='in'/>"
    "      <arg name='y' type='i' direction='in'/>"
    "    </method>"
    "    <method name='Scroll'>"
    "      <arg name='delta' type='i' direction='in'/>"
    "      <arg name='orientation' type='s' direction='in'/>"
    "    </method>"
    "    <method name='ProvideXdgActivationToken'>"
    "      <arg name='token' type='s' direction='in'/>"
    "    </method>"
    "    <property name='Category' type='s' access='read'/>"
    "    <property name='Id' type='s' access='read'/>"
    "    <property name='Title' type='s' access='read'/>"
    "    <property name='Status' type='s' access='read'/>"
    "    <property name='WindowId' type='i' access='read'/>"
    "    <property name='IconName' type='s' access='read'/>"
    "    <property name='IconThemePath' type='s' access='read'/>"
    "    <property name='ItemIsMenu' type='b' access='read'/>"
    "    <property name='Menu' type='o' access='read'/>"
    "    <property name='ToolTip' type='(sa(iiay)ss)' access='read'/>"
    "  </interface>"
    "</node>";

static void on_sni_method_call(GDBusConnection *conn,
                               const gchar *sender,
                               const gchar *object_path,
                               const gchar *interface_name,
                               const gchar *method_name,
                               GVariant *parameters,
                               GDBusMethodInvocation *invocation,
                               gpointer user_data) {
    (void)conn; (void)sender; (void)object_path; (void)interface_name; (void)parameters; (void)user_data;

    if (g_strcmp0(method_name, "Activate") == 0 || g_strcmp0(method_name, "SecondaryActivate") == 0) {
        restore_main_window();
        g_dbus_method_invocation_return_value(invocation, NULL);
    } else if (g_strcmp0(method_name, "ContextMenu") == 0) {
        if (tray_gtk_menu) {
            gtk_menu_popup_at_pointer(GTK_MENU(tray_gtk_menu), NULL);
        }
        g_dbus_method_invocation_return_value(invocation, NULL);
    } else if (g_strcmp0(method_name, "ProvideXdgActivationToken") == 0) {
        const gchar *token = NULL;
        g_variant_get(parameters, "(&s)", &token);
        g_free(pending_activation_token);
        pending_activation_token = g_strdup(token);
        g_dbus_method_invocation_return_value(invocation, NULL);
    } else if (g_strcmp0(method_name, "Scroll") == 0) {
        g_dbus_method_invocation_return_value(invocation, NULL);
    }
}

static GVariant *on_sni_get_property(GDBusConnection *conn,
                                     const gchar *sender,
                                     const gchar *object_path,
                                     const gchar *interface_name,
                                     const gchar *property_name,
                                     GError **error,
                                     gpointer user_data) {
    (void)conn; (void)sender; (void)object_path; (void)interface_name; (void)error; (void)user_data;

    if (g_strcmp0(property_name, "Category") == 0) {
        return g_variant_new_string("ApplicationStatus");
    } else if (g_strcmp0(property_name, "Id") == 0) {
        return g_variant_new_string("cachywire");
    } else if (g_strcmp0(property_name, "Title") == 0) {
        return g_variant_new_string("CachyWire Network Monitor");
    } else if (g_strcmp0(property_name, "Status") == 0) {
        return g_variant_new_string("Active");
    } else if (g_strcmp0(property_name, "WindowId") == 0) {
        return g_variant_new_int32(0);
    } else if (g_strcmp0(property_name, "IconName") == 0) {
        return g_variant_new_string("cachywire");
    } else if (g_strcmp0(property_name, "IconThemePath") == 0) {
        return g_variant_new_string(tray_icon_dir);
    } else if (g_strcmp0(property_name, "ItemIsMenu") == 0) {
        return g_variant_new_boolean(FALSE);
    } else if (g_strcmp0(property_name, "Menu") == 0) {
        return g_variant_new_object_path("/MenuBar");
    } else if (g_strcmp0(property_name, "ToolTip") == 0) {
        GVariantBuilder pixmaps;
        g_variant_builder_init(&pixmaps, G_VARIANT_TYPE("a(iiay)"));
        return g_variant_new("(sa(iiay)ss)", "cachywire", &pixmaps,
                             "CachyWire Network Monitor & Firewall",
                             "Left-click to open CachyWire • Right-click for menu");
    }
    return NULL;
}

static const GDBusInterfaceVTable sni_vtable = {
    on_sni_method_call,
    on_sni_get_property,
    NULL,
    { 0 }
};

static void register_with_sni_watcher(GDBusConnection *conn, const gchar *bus_name) {
    g_dbus_connection_call(
        conn,
        "org.kde.StatusNotifierWatcher",
        "/StatusNotifierWatcher",
        "org.kde.StatusNotifierWatcher",
        "RegisterStatusNotifierItem",
        g_variant_new("(s)", bus_name),
        NULL,
        G_DBUS_CALL_FLAGS_NONE,
        -1,
        NULL,
        NULL,
        NULL
    );
}

static void on_sni_name_acquired(GDBusConnection *conn, const gchar *name, gpointer user_data) {
    (void)user_data;
    register_with_sni_watcher(conn, name);
}

/* Initialize System Tray Icon next to the clock using Native KDE StatusNotifierItem + Dbusmenu */
static void setup_system_tray(const char *icon_dir, const char *icon_file) {
    (void)icon_file;
    if (icon_dir) {
        snprintf(tray_icon_dir, sizeof(tray_icon_dir), "%s", icon_dir);
    }

    tray_gtk_menu = gtk_menu_new();

    GtkWidget *item_status = gtk_menu_item_new_with_label("● CachyWire Active — Rust Native Engine");
    gtk_widget_set_sensitive(item_status, FALSE);
    gtk_menu_shell_append(GTK_MENU_SHELL(tray_gtk_menu), item_status);

    gtk_menu_shell_append(GTK_MENU_SHELL(tray_gtk_menu), gtk_separator_menu_item_new());

    GtkWidget *item_open = gtk_menu_item_new_with_label("Open CachyWire Dashboard");
    g_signal_connect(item_open, "activate", G_CALLBACK(on_tray_open_dashboard), NULL);
    gtk_menu_shell_append(GTK_MENU_SHELL(tray_gtk_menu), item_open);

    GtkWidget *item_clear = gtk_menu_item_new_with_label("Clear All Recorded Data (Reset to 0 B)");
    g_signal_connect(item_clear, "activate", G_CALLBACK(on_tray_clear_all_data), NULL);
    gtk_menu_shell_append(GTK_MENU_SHELL(tray_gtk_menu), item_clear);

    gtk_menu_shell_append(GTK_MENU_SHELL(tray_gtk_menu), gtk_separator_menu_item_new());

    GtkWidget *item_fw_ctb = gtk_menu_item_new_with_label("Firewall: Click to Block");
    g_signal_connect(item_fw_ctb, "activate", G_CALLBACK(on_tray_fw_click_to_block), NULL);
    gtk_menu_shell_append(GTK_MENU_SHELL(tray_gtk_menu), item_fw_ctb);

    GtkWidget *item_fw_ask = gtk_menu_item_new_with_label("Firewall: Ask to Connect");
    g_signal_connect(item_fw_ask, "activate", G_CALLBACK(on_tray_fw_ask_to_connect), NULL);
    gtk_menu_shell_append(GTK_MENU_SHELL(tray_gtk_menu), item_fw_ask);

    GtkWidget *item_fw_lock = gtk_menu_item_new_with_label("Firewall: Block All (Lockdown)");
    g_signal_connect(item_fw_lock, "activate", G_CALLBACK(on_tray_fw_block_all), NULL);
    gtk_menu_shell_append(GTK_MENU_SHELL(tray_gtk_menu), item_fw_lock);

    gtk_menu_shell_append(GTK_MENU_SHELL(tray_gtk_menu), gtk_separator_menu_item_new());

    GtkWidget *item_incog = gtk_menu_item_new_with_label("Toggle Incognito Mode");
    g_signal_connect(item_incog, "activate", G_CALLBACK(on_tray_toggle_incognito), NULL);
    gtk_menu_shell_append(GTK_MENU_SHELL(tray_gtk_menu), item_incog);

    GtkWidget *item_snooze = gtk_menu_item_new_with_label("Snooze Alerts (24 Hours)");
    g_signal_connect(item_snooze, "activate", G_CALLBACK(on_tray_toggle_snooze), NULL);
    gtk_menu_shell_append(GTK_MENU_SHELL(tray_gtk_menu), item_snooze);

    gtk_menu_shell_append(GTK_MENU_SHELL(tray_gtk_menu), gtk_separator_menu_item_new());

    GtkWidget *item_quit = gtk_menu_item_new_with_label("Quit CachyWire Completely");
    g_signal_connect(item_quit, "activate", G_CALLBACK(on_tray_quit), NULL);
    gtk_menu_shell_append(GTK_MENU_SHELL(tray_gtk_menu), item_quit);

    gtk_widget_show_all(tray_gtk_menu);

    /* Export right-click menu over D-Bus at /MenuBar */
    tray_menu_server = dbusmenu_server_new("/MenuBar");
    DbusmenuMenuitem *root_item = dbusmenu_gtk_parse_menu_structure(tray_gtk_menu);
    dbusmenu_server_set_root(tray_menu_server, root_item);

    GDBusConnection *bus = g_bus_get_sync(G_BUS_TYPE_SESSION, NULL, NULL);
    if (bus) {
        GDBusNodeInfo *node_info = g_dbus_node_info_new_for_xml(sni_introspection_xml, NULL);
        if (node_info) {
            g_dbus_connection_register_object(
                bus,
                "/StatusNotifierItem",
                node_info->interfaces[0],
                &sni_vtable,
                NULL,
                NULL,
                NULL
            );
            g_dbus_node_info_unref(node_info);
        }

        char bus_name[128];
        snprintf(bus_name, sizeof(bus_name), "org.kde.StatusNotifierItem-%d-1", (int)getpid());
        g_bus_own_name_on_connection(
            bus,
            bus_name,
            G_BUS_NAME_OWNER_FLAGS_NONE,
            on_sni_name_acquired,
            NULL,
            NULL,
            NULL
        );
    }
}

int main(int argc, char *argv[]) {
    /* NVIDIA proprietary driver + WebKit2GTK DMA-BUF renderer leaks GPU sync_file
     * descriptors until the 1024 fd limit is hit, which freezes the WebProcess.
     * Disable the DMA-BUF renderer and raise the soft fd limit as a safety net. */
    setenv("WEBKIT_DISABLE_DMABUF_RENDERER", "1", 0);
    struct rlimit rl;
    if (getrlimit(RLIMIT_NOFILE, &rl) == 0 && rl.rlim_cur < rl.rlim_max) {
        rl.rlim_cur = rl.rlim_max;
        setrlimit(RLIMIT_NOFILE, &rl);
    }

    resolve_app_root();
    ensure_backend_server();

    gtk_init(&argc, &argv);
    g_set_prgname("cachywire");
    g_set_application_name("CachyWire");

    /* Clear WebKit2GTK disk cache on startup so updated UI/JS/CSS modules always load fresh */
    WebKitWebContext *wk_context = webkit_web_context_get_default();
    if (wk_context) {
        webkit_web_context_clear_cache(wk_context);
        webkit_web_context_set_cache_model(wk_context, WEBKIT_CACHE_MODEL_DOCUMENT_VIEWER);
    }

    GtkSettings *gtk_settings = gtk_settings_get_default();
    if (gtk_settings) {
        g_object_set(gtk_settings, "gtk-application-prefer-dark-theme", TRUE, NULL);
    }

    char icon_dir[PATH_MAX + 32];
    char icon_path[PATH_MAX + 64];
    snprintf(icon_dir, sizeof(icon_dir), "%s/dist/icons", app_root_dir);
    snprintf(icon_path, sizeof(icon_path), "%s/dist/icons/icon_512.png", app_root_dir);

    main_window = gtk_window_new(GTK_WINDOW_TOPLEVEL);
    gtk_window_set_title(GTK_WINDOW(main_window), "CachyWire Network Monitor & Firewall (v0.1.0-alpha) — Open Source CachyOS Edition");
    gtk_window_set_default_size(GTK_WINDOW(main_window), 1280, 820);
    gtk_window_set_position(GTK_WINDOW(main_window), GTK_WIN_POS_CENTER);

    GdkGeometry geom;
    geom.min_width = 960;
    geom.min_height = 640;
    gtk_window_set_geometry_hints(GTK_WINDOW(main_window), NULL, &geom, GDK_HINT_MIN_SIZE);

    if (access(icon_path, R_OK) == 0) {
        gtk_window_set_icon_from_file(GTK_WINDOW(main_window), icon_path, NULL);
    }

    g_signal_connect(main_window, "delete-event", G_CALLBACK(on_main_window_delete_event), NULL);

    WebKitUserContentManager *ucm = webkit_user_content_manager_new();
    g_signal_connect(ucm, "script-message-received::cachywire", G_CALLBACK(on_script_message_received), NULL);
    webkit_user_content_manager_register_script_message_handler(ucm, "cachywire");
    // Note: signal and handler registered once only — duplicate removed (Audit: MEDIUM-4)

    main_webview = webkit_web_view_new_with_user_content_manager(ucm);
    WebKitSettings *wk_settings = webkit_web_view_get_settings(WEBKIT_WEB_VIEW(main_webview));
    webkit_settings_set_enable_developer_extras(wk_settings, TRUE);
    webkit_settings_set_enable_smooth_scrolling(wk_settings, TRUE);
    webkit_settings_set_enable_write_console_messages_to_stdout(wk_settings, TRUE);


    GdkRGBA bg = {0.035, 0.055, 0.102, 1.0};
    webkit_web_view_set_background_color(WEBKIT_WEB_VIEW(main_webview), &bg);

    gtk_container_add(GTK_CONTAINER(main_window), main_webview);
    webkit_web_view_load_uri(WEBKIT_WEB_VIEW(main_webview), GW_MAIN_URL);

    setup_system_tray(icon_dir, icon_path);

    gboolean start_minimized = FALSE;
    for (int i = 1; i < argc; i++) {
        if (strcmp(argv[i], "--minimized") == 0 || strcmp(argv[i], "--tray") == 0) {
            start_minimized = TRUE;
        }
    }

    if (!start_minimized) {
        gtk_widget_show_all(main_window);
    }

    gtk_main();

    stop_backend_server();
    return 0;
}
