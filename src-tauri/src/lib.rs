#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // v2.3.0:Bug fix #1 — exit_app command 强制退出进程
    // 之前用 window.destroy() 在 Tauri WebView2 + Windows 11 仍可能因异步 race
    // 无法真正关闭(用户多轮报告)。改用 std::process::exit(0) 立即终止进程,
    // 牺牲 atexit 清理换取可靠退出 — 单实例应用可接受。
    #[tauri::command]
    fn exit_app() {
        std::process::exit(0);
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_http::init())
        .invoke_handler(tauri::generate_handler![exit_app])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}