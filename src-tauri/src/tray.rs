//! Menu-bar tray icon, the spend popover anchored under it, and close-to-tray.
//!
//! The popover is an ordinary borderless, always-on-top webview window loading
//! `index.html#/tray` — deliberately not a system notification. It is shown by
//! a handshake: `request_popover` asks the page to reload (or creates it), the
//! page renders and answers `tray_popover_ready` with its height, and only then
//! is the window sized, placed under the tray icon and shown. That keeps stale
//! numbers and a wrong-sized window off screen.

use std::sync::Mutex;
use std::time::{Duration, Instant};

use tauri::image::Image;
use tauri::menu::{MenuBuilder, MenuItem, MenuItemBuilder};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{
    AppHandle, Emitter, LogicalSize, Manager, PhysicalPosition, WebviewUrl, WebviewWindow,
    WebviewWindowBuilder, Window, WindowEvent,
};

pub const MAIN: &str = "main";
pub const POPOVER: &str = "tray-popover";
const TRAY_ID: &str = "arlo-tray";

/// Logical width of the popover; its height comes from the page.
const POPOVER_WIDTH: f64 = 320.0;
/// Logical gap between the tray icon / screen edge and the popover.
const POPOVER_GAP: f64 = 6.0;
/// A tray click this soon after a blur-hide is the click that caused the blur.
const BLUR_CLICK_WINDOW: Duration = Duration::from_millis(300);

pub struct TrayState {
    /// `Some(focus)` while a show is waiting on `tray_popover_ready`. A tray
    /// click wants focus (so clicking elsewhere dismisses it); a spend alert
    /// must not steal focus from whatever the user is typing into.
    pending_show: Mutex<Option<bool>>,
    blur_hidden_at: Mutex<Option<Instant>>,
    menu_open: MenuItem<tauri::Wry>,
    menu_quit: MenuItem<tauri::Wry>,
}

pub fn init(app: &AppHandle) -> tauri::Result<()> {
    let menu_open = MenuItemBuilder::with_id("open", "Open Arlo AI Analyzer").build(app)?;
    let menu_quit = MenuItemBuilder::with_id("quit", "Quit Arlo AI Analyzer").build(app)?;
    let menu = MenuBuilder::new(app)
        .item(&menu_open)
        .separator()
        .item(&menu_quit)
        .build()?;

    TrayIconBuilder::with_id(TRAY_ID)
        .icon(Image::from_bytes(include_bytes!(
            "../icons/tray-template.png"
        ))?)
        .icon_as_template(true)
        .tooltip("Arlo AI Analyzer")
        .menu(&menu)
        // Left click opens the spend popover; the menu is on right click.
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "open" => show_main(app),
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                toggle_popover(tray.app_handle());
            }
        })
        .build(app)?;

    app.manage(TrayState {
        pending_show: Mutex::new(None),
        blur_hidden_at: Mutex::new(None),
        menu_open,
        menu_quit,
    });
    Ok(())
}

/// Window-event hook: closing the main window hides it to the tray, and the
/// popover hides itself when it loses focus.
pub fn on_window_event(window: &Window, event: &WindowEvent) {
    match (window.label(), event) {
        (MAIN, WindowEvent::CloseRequested { api, .. }) => {
            api.prevent_close();
            let _ = window.hide();
            #[cfg(target_os = "macos")]
            let _ = window.app_handle().set_dock_visibility(false);
        }
        (POPOVER, WindowEvent::Focused(false)) => {
            let _ = window.hide();
            if let Some(state) = window.app_handle().try_state::<TrayState>() {
                *state.blur_hidden_at.lock().unwrap() = Some(Instant::now());
            }
        }
        _ => {}
    }
}

pub fn show_main(app: &AppHandle) {
    #[cfg(target_os = "macos")]
    let _ = app.set_dock_visibility(true);
    if let Some(window) = app.get_webview_window(MAIN) {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

fn toggle_popover(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(POPOVER) {
        if window.is_visible().unwrap_or(false) {
            let _ = window.hide();
            return;
        }
    }
    // Clicking the icon while the popover has focus blurs it first, and the
    // blur already hid it — don't bring it straight back.
    let state = app.state::<TrayState>();
    let recently_blurred = state
        .blur_hidden_at
        .lock()
        .unwrap()
        .is_some_and(|at| at.elapsed() < BLUR_CLICK_WINDOW);
    if !recently_blurred {
        let _ = request_popover(app, true);
    }
}

fn request_popover(app: &AppHandle, focus: bool) -> tauri::Result<()> {
    {
        let state = app.state::<TrayState>();
        let mut pending = state.pending_show.lock().unwrap();
        *pending = Some(pending.unwrap_or(false) || focus);
    }
    if app.get_webview_window(POPOVER).is_some() {
        app.emit_to(POPOVER, "tray-popover-refresh", ())
    } else {
        // The new page loads its data and answers `tray_popover_ready`.
        WebviewWindowBuilder::new(app, POPOVER, WebviewUrl::App("index.html#/tray".into()))
            .title("Arlo AI Analyzer")
            .inner_size(POPOVER_WIDTH, 200.0)
            .resizable(false)
            .maximizable(false)
            .minimizable(false)
            .decorations(false)
            .always_on_top(true)
            .skip_taskbar(true)
            .visible_on_all_workspaces(true)
            .accept_first_mouse(true)
            .focused(false)
            .visible(false)
            .build()
            .map(|_| ())
    }
}

/// Place the popover under the tray icon (above it when the tray is at the
/// bottom of the screen, as on Windows).
fn position_popover(app: &AppHandle, window: &WebviewWindow, height: f64) -> tauri::Result<()> {
    let icon = app
        .tray_by_id(TRAY_ID)
        .and_then(|tray| tray.rect().ok().flatten());
    let scale = window.scale_factor()?;

    let monitor = match &icon {
        Some(rect) => {
            let p = rect.position.to_physical::<f64>(scale);
            window.monitor_from_point(p.x, p.y)?
        }
        None => None,
    }
    .or(window.primary_monitor()?);
    let Some(monitor) = monitor else {
        return Ok(());
    };

    let scale = monitor.scale_factor();
    let area = monitor.work_area();
    let area = PxRect {
        x: area.position.x,
        y: area.position.y,
        w: area.size.width as i32,
        h: area.size.height as i32,
    };
    let icon = match icon {
        Some(rect) => {
            let p = rect.position.to_physical::<i32>(scale);
            let s = rect.size.to_physical::<u32>(scale);
            PxRect {
                x: p.x,
                y: p.y,
                w: s.width as i32,
                h: s.height as i32,
            }
        }
        // No tray geometry (Linux): top-right corner of the work area.
        None => PxRect {
            x: area.x + area.w,
            y: area.y,
            w: 0,
            h: 0,
        },
    };
    let size = (
        (POPOVER_WIDTH * scale).round() as i32,
        (height * scale).round() as i32,
    );
    let (x, y) = popover_origin(icon, area, size, (POPOVER_GAP * scale).round() as i32);
    window.set_position(PhysicalPosition::new(x, y))
}

#[derive(Debug, Clone, Copy)]
struct PxRect {
    x: i32,
    y: i32,
    w: i32,
    h: i32,
}

/// Top-left corner, in physical pixels, for a popover of `size` anchored to
/// `icon`: centred on it, kept inside `area` by `gap`, below the icon when the
/// icon is in the top half of the screen and above it otherwise.
fn popover_origin(icon: PxRect, area: PxRect, size: (i32, i32), gap: i32) -> (i32, i32) {
    let (w, h) = size;
    let min_x = area.x + gap;
    let max_x = (area.x + area.w - w - gap).max(min_x);
    let x = (icon.x + icon.w / 2 - w / 2).clamp(min_x, max_x);

    let icon_in_top_half = icon.y + icon.h / 2 < area.y + area.h / 2;
    let y = if icon_in_top_half {
        (icon.y + icon.h).max(area.y) + gap
    } else {
        icon.y.min(area.y + area.h) - h - gap
    };
    (x, y)
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

/// Show the spend popover under the tray icon. `focus: false` for alerts.
// async: creating a window from a sync command deadlocks on Windows.
#[tauri::command]
pub async fn show_tray_popover(app: AppHandle, focus: bool) -> Result<(), String> {
    request_popover(&app, focus).map_err(|e| e.to_string())
}

/// The popover page has rendered fresh data at `height` logical px.
#[tauri::command]
pub fn tray_popover_ready(
    app: AppHandle,
    window: WebviewWindow,
    state: tauri::State<TrayState>,
    height: f64,
) -> Result<(), String> {
    if window.label() != POPOVER {
        return Err("tray_popover_ready is for the tray popover".into());
    }
    let run = || -> tauri::Result<()> {
        window.set_size(LogicalSize::new(POPOVER_WIDTH, height))?;
        let pending = state.pending_show.lock().unwrap().take();
        if let Some(focus) = pending {
            position_popover(&app, &window, height)?;
            window.show()?;
            if focus {
                window.set_focus()?;
            }
        }
        Ok(())
    };
    run().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn hide_tray_popover(app: AppHandle) -> Result<(), String> {
    match app.get_webview_window(POPOVER) {
        Some(window) => window.hide().map_err(|e| e.to_string()),
        None => Ok(()),
    }
}

/// Bring the main window back from the tray, optionally at `route`.
#[tauri::command]
pub fn open_main_window(app: AppHandle, route: Option<String>) -> Result<(), String> {
    let _ = hide_tray_popover(app.clone());
    show_main(&app);
    if let Some(route) = route.filter(|r| r.starts_with('/')) {
        app.emit_to(MAIN, "navigate", route)
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Localized labels for the tray's right-click menu, pushed by the frontend.
#[tauri::command]
pub fn localize_tray(
    state: tauri::State<TrayState>,
    open: String,
    quit: String,
) -> Result<(), String> {
    state.menu_open.set_text(open).map_err(|e| e.to_string())?;
    state.menu_quit.set_text(quit).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    // A 2560×1600 (1280×800 @2x) display whose work area starts under a 48 px menu bar.
    const MAC_AREA: PxRect = PxRect {
        x: 0,
        y: 48,
        w: 2560,
        h: 1552,
    };
    const SIZE: (i32, i32) = (640, 400);

    #[test]
    fn centres_under_a_menu_bar_icon() {
        let icon = PxRect {
            x: 1800,
            y: 0,
            w: 44,
            h: 48,
        };
        assert_eq!(popover_origin(icon, MAC_AREA, SIZE, 12), (1822 - 320, 60));
    }

    #[test]
    fn clamps_inside_the_screen_edge() {
        let icon = PxRect {
            x: 2500,
            y: 0,
            w: 44,
            h: 48,
        };
        assert_eq!(
            popover_origin(icon, MAC_AREA, SIZE, 12),
            (2560 - 640 - 12, 60)
        );

        let icon = PxRect {
            x: 4,
            y: 0,
            w: 44,
            h: 48,
        };
        assert_eq!(popover_origin(icon, MAC_AREA, SIZE, 12).0, 12);
    }

    #[test]
    fn opens_above_a_bottom_taskbar_icon() {
        // Windows: 1920×1080 with a 48 px taskbar at the bottom.
        let area = PxRect {
            x: 0,
            y: 0,
            w: 1920,
            h: 1032,
        };
        let icon = PxRect {
            x: 1400,
            y: 1040,
            w: 32,
            h: 32,
        };
        assert_eq!(
            popover_origin(icon, area, SIZE, 12),
            (1416 - 320, 1032 - 400 - 12)
        );
    }

    #[test]
    fn respects_a_secondary_monitor_origin() {
        let area = PxRect {
            x: -1920,
            y: 25,
            w: 1920,
            h: 1055,
        };
        let icon = PxRect {
            x: -300,
            y: 0,
            w: 40,
            h: 25,
        };
        assert_eq!(
            popover_origin(icon, area, SIZE, 12),
            (-1920 + 1920 - 640 - 12, 37)
        );
    }

    #[test]
    fn falls_back_to_the_top_right_corner() {
        let icon = PxRect {
            x: MAC_AREA.x + MAC_AREA.w,
            y: MAC_AREA.y,
            w: 0,
            h: 0,
        };
        assert_eq!(
            popover_origin(icon, MAC_AREA, SIZE, 12),
            (2560 - 640 - 12, 60)
        );
    }
}
