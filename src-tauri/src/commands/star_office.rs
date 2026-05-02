use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

const WINDOW_LABEL: &str = "star_office_window";

/// 打开星际办公室独立窗口
#[tauri::command]
pub async fn open_star_office_window(app: AppHandle) -> Result<String, String> {
    // 如果窗口已存在，先关闭
    if let Some(existing) = app.get_webview_window(WINDOW_LABEL) {
        let _ = existing.close();
    }

    // 创建新窗口，加载 /star-office 路由
    WebviewWindowBuilder::new(&app, WINDOW_LABEL, WebviewUrl::App("/star-office".into()))
        .title("⭐ 星际办公室")
        .inner_size(960.0, 640.0)
        .min_inner_size(720.0, 480.0)
        .resizable(true)
        .decorations(true)
        .center()
        .build()
        .map_err(|e| format!("创建星际办公室窗口失败: {}", e))?;

    Ok("ok".into())
}
