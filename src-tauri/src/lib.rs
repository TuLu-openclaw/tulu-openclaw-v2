mod commands;
mod models;
mod tray;
mod utils;
#[cfg(target_os = "windows")]
mod windows_proxy;

use commands::{
    agency_agents, agent, assistant, cli_anything, config, device, extensions, hermes,
    hermes_providers, logs, memory, messaging, music, openmontage, pairing, proxy, service, skills,
    tvbox, update,
};

const CODEX_PROMPT_USAGE_TEXT: &str =
    include_str!("../resources/codex提示词/codex提示词使用方法.txt");
const CODEX_INSTRUCTION_TEXT: &str = include_str!("../resources/codex提示词/instruction.md");

fn sync_codex_prompt_workspace_folder() -> Result<(), String> {
    let target_dir = commands::openclaw_dir()
        .join("workspace")
        .join("codex提示词");
    std::fs::create_dir_all(&target_dir)
        .map_err(|e| format!("创建 codex提示词 工作区目录失败: {e}"))?;

    sync_text_file(
        &target_dir.join("codex提示词使用方法.txt"),
        CODEX_PROMPT_USAGE_TEXT,
        "codex提示词 使用方法",
    )?;
    sync_text_file(
        &target_dir.join("instruction.md"),
        CODEX_INSTRUCTION_TEXT,
        "codex提示词 instruction.md",
    )?;

    Ok(())
}

fn sync_text_file(path: &std::path::Path, content: &str, label: &str) -> Result<(), String> {
    let should_write = match std::fs::read_to_string(path) {
        Ok(existing) => existing != content,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => true,
        Err(e) => return Err(format!("读取 {label} 失败: {e}")),
    };

    if should_write {
        std::fs::write(path, content).map_err(|e| format!("写入 {label} 失败: {e}"))?;
    }

    Ok(())
}

#[cfg(target_os = "windows")]
fn start_install_shutdown_watcher(app: tauri::AppHandle) {
    std::thread::spawn(move || {
        let mut signal_paths = vec![commands::openclaw_dir()
            .join("星枢OpenClaw")
            .join("install-shutdown.signal")];

        if let Ok(local_app_data) = std::env::var("LOCALAPPDATA") {
            signal_paths.push(
                std::path::PathBuf::from(local_app_data)
                    .join("星枢OpenClaw")
                    .join("install-shutdown.signal"),
            );
        }

        loop {
            let now = std::time::SystemTime::now();
            let fresh_signal = signal_paths.iter().any(|path| {
                path.metadata()
                    .and_then(|metadata| metadata.modified())
                    .ok()
                    .and_then(|modified| now.duration_since(modified).ok())
                    .map(|age| age <= std::time::Duration::from_secs(120))
                    .unwrap_or(false)
            });

            if fresh_signal {
                for path in &signal_paths {
                    let _ = std::fs::remove_file(path);
                }
                app.exit(0);
                break;
            }
            std::thread::sleep(std::time::Duration::from_millis(400));
        }
    });
}

#[cfg(not(target_os = "windows"))]
fn start_install_shutdown_watcher(_app: tauri::AppHandle) {}

pub fn run() {
    let hot_update_dir = commands::openclaw_dir()
        .join("星枢OpenClaw")
        .join("web-update");

    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init());

    #[cfg(any(target_os = "macos", windows, target_os = "linux"))]
    {
        builder = builder.plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ));
    }

    builder
        .register_uri_scheme_protocol("tauri", move |ctx, request| {
            let uri_path = request.uri().path();
            let path = if uri_path == "/" || uri_path.is_empty() {
                "index.html"
            } else {
                uri_path.strip_prefix('/').unwrap_or(uri_path)
            };

            // 1. 优先检查热更新目录
            let update_file = hot_update_dir.join(path);
            if update_file.is_file() {
                if let Ok(data) = std::fs::read(&update_file) {
                    return tauri::http::Response::builder()
                        .header(
                            tauri::http::header::CONTENT_TYPE,
                            update::mime_from_path(path),
                        )
                        .body(data)
                        .unwrap();
                }
            }

            // 2. 回退到内嵌资源
            if let Some(asset) = ctx.app_handle().asset_resolver().get(path.to_string()) {
                let builder = tauri::http::Response::builder()
                    .header(tauri::http::header::CONTENT_TYPE, &asset.mime_type);
                // Tauri 内嵌资源可能带 CSP header
                let builder = if let Some(csp) = asset.csp_header {
                    builder.header("Content-Security-Policy", csp)
                } else {
                    builder
                };
                builder.body(asset.bytes).unwrap()
            } else {
                tauri::http::Response::builder()
                    .status(tauri::http::StatusCode::NOT_FOUND)
                    .body(b"Not Found".to_vec())
                    .unwrap()
            }
        })
        .setup(|app| {
            start_install_shutdown_watcher(app.handle().clone());
            service::start_backend_guardian(app.handle().clone());
            if let Err(e) = sync_codex_prompt_workspace_folder() {
                eprintln!("[codex-prompt] 同步 Agent 工作区文件夹失败: {e}");
            }
            tray::setup_tray(app.handle())?;
            assistant::start_office_sync(app.handle().clone());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // 配置
            config::read_openclaw_config,
            config::write_openclaw_config,
            config::validate_openclaw_config,
            config::read_mcp_config,
            config::write_mcp_config,
            config::get_version_info,
            config::get_version_info_local,
            config::check_installation,
            config::init_openclaw_config,
            config::calibrate_openclaw_config,
            config::check_node,
            config::check_node_at_path,
            config::check_openclaw_at_path,
            config::scan_node_paths,
            config::auto_install_node,
            config::scan_openclaw_paths,
            config::save_custom_node_path,
            config::write_env_file,
            config::list_backups,
            config::create_backup,
            config::restore_backup,
            config::delete_backup,
            config::reload_gateway,
            config::restart_gateway,
            config::assistant_api_request,
            config::assistant_chat_once,
            config::test_model,
            config::translate_text,
            config::list_remote_models,
            config::list_openclaw_versions,
            config::upgrade_openclaw,
            config::uninstall_openclaw,
            config::install_gateway,
            config::uninstall_gateway,
            config::patch_model_vision,
            config::check_panel_update,
            config::get_openclaw_dir,
            config::read_panel_config,
            config::write_panel_config,
            config::get_bundled_runtime_status,
            config::deploy_bundled_node,
            config::deploy_bundled_git,
            config::deploy_bundled_runtime,
            config::test_proxy,
            config::get_npm_registry,
            config::set_npm_registry,
            config::check_git,
            config::scan_git_paths,
            config::auto_install_git,
            config::configure_git_https,
            config::invalidate_path_cache,
            config::clear_usage_cost_cache,
            config::get_status_summary,
            config::doctor_fix,
            config::doctor_check,
            config::relaunch_app,
            // 设备密钥 + Gateway 握手
            device::create_connect_frame,
            // 设备配对
            pairing::auto_pair_device,
            pairing::check_pairing_status,
            pairing::pairing_list_channel,
            pairing::pairing_approve_channel,
            // 服务
            service::get_services_status,
            service::start_service,
            service::stop_service,
            service::restart_service,
            service::claim_gateway,
            service::guardian_status,
            // 日志
            logs::read_log_tail,
            logs::search_log,
            // 记忆文件
            memory::list_memory_files,
            memory::read_memory_file,
            memory::write_memory_file,
            memory::delete_memory_file,
            memory::export_memory_zip,
            // 扩展工具
            extensions::get_cftunnel_status,
            extensions::cftunnel_action,
            extensions::get_cftunnel_logs,
            extensions::get_clawapp_status,
            extensions::install_cftunnel,
            extensions::install_clawapp,
            // OpenMontage 外部视频工厂（AGPL，外部连接器模式）
            openmontage::openmontage_status,
            openmontage::openmontage_prepare_runtime,
            openmontage::openmontage_install,
            openmontage::openmontage_open_studio,
            openmontage::openmontage_open_folder,
            // CLI-Anything 工具中心（外部连接器 + 安全安装器）
            cli_anything::cli_anything_status,
            cli_anything::cli_anything_install,
            cli_anything::cli_anything_catalog,
            cli_anything::cli_anything_install_tool,
            cli_anything::cli_anything_uninstall_tool,
            cli_anything::cli_anything_matrix_preflight,
            // Agent 管理
            agent::list_agents,
            agent::get_agent_detail,
            agent::list_agent_files,
            agent::read_agent_file,
            agent::write_agent_file,
            agent::get_agent_workspace_info,
            agent::list_agent_workspace_entries,
            agent::read_agent_workspace_file,
            agent::write_agent_workspace_file,
            agent::add_agent,
            agent::delete_agent,
            agent::update_agent_config,
            agent::update_agent_identity,
            agent::update_agent_model,
            agent::import_agent_workspace,
            agent::backup_agent,
            // AI 专家库
            agency_agents::agency_agents_list,
            agency_agents::agency_agent_detail,
            agency_agents::agency_agent_install,
            agency_agents::agency_agents_install_bulk,
            // AI 助手工具
            assistant::assistant_exec,
            assistant::assistant_read_file,
            assistant::assistant_write_file,
            assistant::assistant_list_dir,
            assistant::assistant_system_info,
            assistant::device_info,
            assistant::assistant_list_processes,
            assistant::assistant_check_port,
            assistant::assistant_web_search,
            assistant::assistant_fetch_url,
            #[cfg(target_os = "windows")]
            assistant::fetch_page,
            #[cfg(target_os = "windows")]
            assistant::fetch_page_js,
            #[cfg(target_os = "windows")]
            assistant::open_player_window,
            #[cfg(target_os = "windows")]
            assistant::open_lobster_office,
            assistant::open_xingshu_chat_window,
            assistant::open_xingshu_skill_center_window,
            assistant::open_xingshu_skill_security_window,
            #[cfg(target_os = "windows")]
            assistant::open_global_builtin_window,
            assistant::fetch_live_sources,
            assistant::save_recording,
            assistant::open_live_player,
            assistant::close_live_player,
            assistant::navigate_window,
            assistant::get_window_by_label,
            assistant::update_office_state,
            assistant::sync_openclaw_to_office,
            #[cfg(target_os = "windows")]
            assistant::vod_fetch,
            #[cfg(target_os = "windows")]
            assistant::napp03_api_fetch,
            // 数据目录 & 图片存储
            assistant::assistant_ensure_data_dir,
            assistant::assistant_save_image,
            assistant::assistant_load_image,
            assistant::assistant_load_media_file,
            assistant::assistant_open_containing_folder,
            assistant::assistant_delete_image,
            // Hermes Agent
            hermes::check_hermes,
            hermes::check_python,
            hermes::install_hermes,
            hermes::configure_hermes,
            hermes::hermes_gateway_action,
            hermes::hermes_health_check,
            hermes::hermes_api_proxy,
            hermes::hermes_agent_run,
            hermes::hermes_read_config,
            hermes::hermes_fetch_models,
            hermes::hermes_update_model,
            hermes::hermes_detect_environments,
            hermes_providers::hermes_list_providers,
            hermes::hermes_env_read_unmanaged,
            hermes::hermes_env_set,
            hermes::hermes_env_delete,
            hermes::hermes_env_reveal,
            hermes::hermes_config_raw_read,
            hermes::hermes_config_raw_write,
            hermes::hermes_set_gateway_url,
            hermes::update_hermes,
            hermes::uninstall_hermes,
            hermes::music_search,
            hermes::hermes_sessions_list,
            hermes::hermes_sessions_summary_list,
            hermes::hermes_usage_analytics,
            hermes::hermes_session_detail,
            hermes::hermes_session_delete,
            hermes::hermes_session_rename,
            hermes::hermes_profiles_list,
            hermes::hermes_profile_use,
            hermes::hermes_logs_list,
            hermes::hermes_logs_read,
            hermes::hermes_logs_download,
            hermes::hermes_skills_list,
            hermes::hermes_skill_detail,
            hermes::hermes_skill_toggle,
            hermes::hermes_skill_files,
            hermes::hermes_skill_write,
            hermes::hermes_memory_read,
            hermes::hermes_memory_write,
            hermes::hermes_memory_read_all,
            hermes::hermes_dashboard_probe,
            hermes::hermes_dashboard_start,
            hermes::hermes_dashboard_stop,
            hermes::hermes_dashboard_themes,
            hermes::hermes_dashboard_theme_set,
            hermes::hermes_dashboard_plugins,
            hermes::hermes_dashboard_plugins_rescan,
            hermes::hermes_toolsets_list,
            hermes::hermes_cron_jobs_list,
            // 消息渠道管理
            messaging::read_platform_config,
            messaging::save_messaging_platform,
            messaging::remove_messaging_platform,
            messaging::toggle_messaging_platform,
            messaging::verify_bot_token,
            messaging::diagnose_channel,
            messaging::repair_qqbot_channel_setup,
            messaging::list_configured_platforms,
            messaging::get_channel_plugin_status,
            messaging::install_channel_plugin,
            messaging::install_qqbot_plugin,
            messaging::run_channel_action,
            messaging::check_weixin_plugin_status,
            // Agent 渠道绑定管理
            messaging::get_agent_bindings,
            messaging::list_all_bindings,
            messaging::save_agent_binding,
            messaging::delete_agent_binding,
            messaging::delete_agent_all_bindings,
            // Skills 管理
            skills::skills_list,
            skills::skills_info,
            skills::skills_check,
            skills::skills_install_dep,
            skills::skills_uninstall,
            skills::skills_validate,
            skills::skills_scan_diagnostics,
            // SkillHub SDK（内置 HTTP，不依赖 CLI）
            skills::skillhub_search,
            skills::skillhub_index,
            skills::skillhub_install,
            skills::xingshu_skill_install,
            skills::hermes_skillhub_install,
            hermes::check_hermes_update,
            // 前端热更新 + 全量客户端更新（只改这两项；OpenClaw CLI/Gateway、Hermes、Web部署更新不动）
            update::check_frontend_update,
            update::download_frontend_update,
            update::check_full_app_update,
            update::download_full_app_update,
            update::rollback_frontend_update,
            update::get_update_status,
            // TVBox 框架接口
            tvbox::tvbox_req,
            tvbox::tvbox_md5,
            tvbox::tvbox_base64_encode,
            tvbox::tvbox_base64_decode,
            tvbox::tvbox_store_set,
            tvbox::tvbox_store_get,
            tvbox::tvbox_store_keys,
            tvbox::tvbox_store_del,
            tvbox::tvbox_cookie_get,
            tvbox::tvbox_parse,
            // 全球内置代理 + 微验卡密 API
            proxy::proxy_url,
            proxy::weiyan_api_post,
            // 音乐播放器
            music::music_search_all,
            music::music_get_play_url,
            music::music_proxy_audio,
            music::music_download_song,
            music::music_set_download_dir,
            music::music_get_download_dir,
            music::music_get_lyrics,
        ])
        .on_window_event(|window, event| {
            // 关闭窗口时最小化到托盘，不退出应用（仅主窗口）
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "main" {
                    api.prevent_close();
                    let _ = window.hide();
                }
                // 其他窗口（如 global_builtin_window）正常关闭销毁
            }
        })
        .build(tauri::generate_context!())
        .expect("启动 星枢OpenClaw 失败")
        .run(|_app, event| {
            if let tauri::RunEvent::Exit = event {
                #[cfg(target_os = "windows")]
                {
                    // 退出时关闭 Gateway 终端窗口
                    use std::os::windows::process::CommandExt;
                    const CREATE_NO_WINDOW: u32 = 0x08000000;
                    let _ = std::process::Command::new("cmd")
                        .args(["/c", "taskkill", "/fi", "WINDOWTITLE eq OpenClaw Gateway"])
                        .creation_flags(CREATE_NO_WINDOW)
                        .output();
                }
            }
        });
}
