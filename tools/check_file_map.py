"""Generate/check a purpose entry for every distributable repository file."""
import argparse
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
IGNORED = {'.git', '__pycache__', 'node_modules', 'dist', '.venv', '.local-state'}

FRONTEND = {
    'model_asset_loader': '模型网格有限并发、网络读取重试、错误定位与旧请求释放',
    'teleop_pairing': '已连接主从型号配对策略，实体 LumosTouch 仅允许 Touch R1',
    'lumos_client': '本机 Lumos CAN 会话、六轴与夹爪新鲜采样、网页校准与停止',
    'training-submission': '识别已提交训练任务与数据准备、训练、停止状态，避免超时后重复提交',
    'api-client': '本机 API 请求与响应体超时、错误反馈和取消管理',
    'page-lifecycle': '页面切换前停止控制、释放串口与按钮处理状态',
    'interaction': '按钮处理提示与页面切换状态样式',
    'a1z_model_data': 'A1Z 3D 零件与关节数据', 'b601_model_data': 'B601 显示模型的零件与关节数据',
    'piper_model_data': 'PiPER Mate 烘焙模型与关节原始数据', 'urdf_model_data': '原始机械臂 URDF 转换后的显示数据',
    'act-camera-frame-encoder-worker-client': '管理相机编码 Worker 请求、超时与退出',
    'act-camera-frame-encoder-worker': '在后台 Worker 中编码相机 JPEG，减少主界面阻塞',
    'act-camera-frame-uploader': '管理双相机帧上传队列、批次与结束排空',
    'act-camera-state': '统一相机连接、采集和丢帧状态', 'act-cameras': 'ACT 相机设备选择、角色绑定与预览',
    'act-capture-quality': '采集同步质量和帧率统计', 'act-inference': '执行诊断面板与推理界面样式',
    'act-installer': '验证模板并生成绑定当前网站的 Ubuntu 安装包',
    'act-motion': 'ACT 元素出现、退出和交互过渡', 'act-ui-refresh': 'ACT 面板布局、空相机状态与交互视觉样式',
    'act-waveform': 'Action / State 多通道曲线、时间轴与绘制',
    'act-browser-app': 'Windows 纯网页模型导入、相机串口授权、校验与执行界面',
    'act-browser-core': '网页模型合同、原版校准坐标转换、限位与时间索引动作调度',
    'act-browser-runtime': '浏览器 Worker 推理与串口控制、实时反馈、停止和资源释放',
    'act-browser-worker': '隔离线程校验模型包，加载 WebGPU 引擎并计算完整 ACT 动作块',
    'act-browser': '纯网页执行入口的布局、侧栏滚动与过渡样式',
    'act-workbench': 'ACT 四步骤工作台的流程、API、采集、训练和模型执行交互',
    'app': '控制台入口：初始化 3D、机械臂、串口和界面事件',
    'browser_serial_utils': '浏览器串口超时、读取与可取消任务工具',
    'command_execution': '协调控制指令执行和停止', 'control_lifecycle': '管理控制会话生命周期与资源释放',
    'control_safety': '控制台运动限位、约束与安全检查', 'factory_params': '舵机工厂参数定义、解析与验证',
    'factory_restore': '恢复舵机工厂参数的流程', 'fashionstar_serial': 'FashionStar 浏览器串口协议封装',
    'fl_trajectory_controller': '从臂轨迹播放、暂停、停止和指令调度',
    'fl_trajectory_model': '从臂轨迹结构、插值与关节模型', 'fl_trajectory_preview': '从臂轨迹的 3D 预览',
    'fl_trajectory_store': '从臂轨迹持久化、导入与导出', 'fl_trajectory_styles': '从臂轨迹编辑面板样式',
    'fl_trajectory_workspace': '从臂轨迹工作区界面和操作', 'follower_target': '从臂目标与实际关节状态转换',
    'i18n': '控制台中英文文本', 'ik_solver': '末端逆运动学求解', 'joint_mapper': '舵机角度与显示模型关节方向映射',
    'joint_slider_control': '关节滑条输入与连续控制', 'local-service': '本机后台探测、组件下载与环境准备接续',
    'manual_control_session': '手动控制会话的启动、结束与指令管理', 'rate_meter': '采样与通信频率统计',
    'reset_origin': '机械臂回零与原点重置', 'robot_model_configs': '可选显示模型、关节与资源配置',
    'robot_model': '创建 3D 关节树并应用实际关节角度', 'robot_profiles': '主从臂型号、关节范围和控制配置',
    'runtime_integration': '控制台运行状态与设备控制的集成', 'serial_servo_bus': '舵机总线串口收发与响应管理',
    'servo_readback': '控制台按 ID 收集回包、每轮统一超时、仅补读缺失关节与清理等待',
    'servo_setup_flow': '舵机 ID 和波特率冲突探测、保留保护参数的写入核验与只读恢复',
    'servo_setup': 'LD 三维选舵机、逐颗总线配置与单颗参数编辑',
    'servo_bus_wizard': '一次启动自动检测七颗新舵机、编号、恢复 ID 0、统一速率与暂停接续',
    'servo_setup_model': '配置页独立 LD 三维模型、网格点选、七颗编号与高亮',
    'servo_setup_parts': '从原始 LD CAD 生成的独立舵机机壳中心与精确三角面点选分组',
    'servo_setup_i18n': '舵机配置页面、步骤、错误与通信反馈的中英文文本',
    'settings': '控制台用户设置与持久化', 'styles': '控制台主题、响应式布局和通用控件样式',
    'target_execution_ownership': '确保运动目标同一时间由一个执行者持有', 'tcp_drag_preview': '拖动末端时的目标预览',
    'tcp_translation_gizmo': '3D 末端平移操作控件', 'teleop_controller': '主从臂遥操作与周期控制',
    'version': '原控制台版本显示信息', 'workspace-switch': '控制台与 ACT 的全屏能量环切换、倒计时与取消',
}
BACKEND = {
    'lumos_runtime': 'Ubuntu Lumos SDK 六轴与夹爪控制、当次校准、配对与失联看门狗',
    'website_authorization': 'Windows 当前网站连接确认、限时单次令牌与确认界面',
    'windows_cameras': 'Windows DirectShow 双相机枚举、模式和原生 JPEG 视频流',
    '__init__': 'Python 后台包入口', 'act_policy_worker': '独立进程加载 ACT 策略并产生预测动作',
    'action_schedule': '动作块队列、节拍调度与多次预测融合', 'app': '本机 HTTP API、静态页面与资源生命周期',
    'capabilities': '检测 Python、训练依赖、GPU 与运行阻碍', 'devices': '设备枚举与稳定标识、角色绑定',
    'domain': '数据集、轮次、设备绑定与业务错误规则', 'episode_data': '示教轮次、JPEG、索引、完整性及导入导出',
    'fashionstar_protocol': 'FashionStar 原始协议打包、校验与反馈解析',
    'follower_calibration': '从臂校准记录、范围、JSON 与归一化转换',
    'inference_runtime': '策略进程、状态读取、动作调度与推理诊断',
    'lerobot_convert': '将示教角度、相机和统计量转换到 LeRobot 数据约定',
    'model_import': '完整模型包验证、发行包识别与导入整理',
    'native_act_driver': '原生 FashionStar SDK 适配与从臂读写、校准坐标转换',
    'native_cameras': 'Ubuntu V4L2 双相机枚举、模式、JPEG 流与采集',
    'release_adapter': '将上游发行模型的目录和配置适配为本工作台模型',
    'serial_connections': 'Linux 主从臂串口连接、读取、写入与状态', 'store': '业务状态的本机持久化',
    'synchronizer': '关节与相机样本时间同步', 'telemetry': '实时状态和 SSE 遥测发布',
    'teleop_runtime': '主从臂示教循环、滤波与真实样本发布',
    'training_dataset': '训练数据准备、完整性检查与转换缓存',
    'training_environment': '独立 Python 环境准备、依赖安装与加速设备自检',
    'training_jobs': '训练子进程、日志、检查点、停止与恢复',
    'browser_exports': '训练端异步网页模型导出、依赖准备、状态与下载',
    'browser_export_worker': '将 ACT 和处理器导出浏览器图，三组输入比对原版后打包',
    'training_manifest': 'Python / LeRobot / PyTorch 版本及加速源清单',
}
EXACT = {
    'tools/build_ld_servo_map.py': '从原 LD CAD 生成并核验七颗舵机机壳分组，第五和第六颗同属 link5',
    'tests/servo_setup_browser_smoke.cjs': '软件测试：模拟七颗总线舵机、三维点选、单颗改参、冲突、中断恢复和中英文布局',
    'tests/helpers/servo_setup_hardware.cjs': '软件测试：可追加舵机、切速、读写公共参数及丢包的模拟 Web Serial',
    'tools/check_touch_model.py': '核验 Touch R1 V3.2 上游校验值、七颗舵机、双夹指和 URDF 从动关系',
    'tests/touch_model_browser_smoke.cjs': '软件测试：隔离本地服务验证完整 Touch R1 资源、七轴滑块和夹爪模型预览',
    'start_ubuntu_lumos.sh': '使用系统 Python 准备隔离 Lumos SDK 环境并打开 Ubuntu 本机控制台',
    'tools/start_lumos_local.py': '固定版本 Lumos SDK 安装、独立本机服务与重复启动检查',
    'tools/package_lumos_local.py': '打包 Ubuntu Touch R1 与 LumosTouch 本地遥操作源码',
    'docs/LUMOS_TELEOP.md': 'Ubuntu CAN 连接、网页校准、预览、遥操作与测试边界',
    'tests/test_lumos_api.py': '软件测试：Lumos 本机同源 API、会话字段、错误传播与跨站拒绝',
    'tests/test_lumos_local.py': '软件测试：Lumos 独立启动器、SDK 固定版本及服务复用',
    'tests/lumos_browser_smoke.cjs': '软件测试：浏览器 Touch R1 与模拟 Lumos CAN 连接、校准、跟随和释放',
    'Browser_SDK/assets/urdf/ld-touch/SOURCE.json': 'Touch R1 上游固定提交与资源校验清单',
    'Browser_SDK/assets/urdf/ld-touch/kinematics.json': 'Touch R1 上游关节坐标、几何生成和源文件校验报告',
    'Browser_SDK/assets/urdf/ld-touch/upstream-README.md': 'Touch R1 上游模型原始说明与实机标定边界',
    'start_windows_urdf.bat': 'Windows 双击打开控制台，测试 Touch R1 Leader 与 LumosTouch 虚拟从臂',
    'Browser_SDK/src/supplied_urdf_mapping.js': 'Touch R1 Leader 和 LumosTouch 虚拟从臂的显示角度与夹指位移映射',
    'Browser_SDK/src/workspace-nav.js': '统一工作区下拉菜单的键盘、失焦收起及控制台标题高度同步',
    'Browser_SDK/src/workspace-nav.css': '三页统一工作区导航与桌面、窄屏布局',
    'Browser_SDK/urdf-preview.html': '用户提供的 FL 与 Touch R1 LD 模型切换和逐轴姿态预览',
    'Browser_SDK/src/urdf-preview.js': '独立 URDF 预览状态、旋转与平移关节滑块，不连接硬件',
    'Browser_SDK/src/urdf-preview.css': 'URDF 模型大画布、关节侧栏及移动端布局',
    'Browser_SDK/src/supplied_urdf_models.js': '用户 FL 与 Touch R1 LD 原始关节树、视觉材质与网格引用',
    'docs/URDF_MODELS.md': '新增 FL 和 LD 模型预览入口、来源和坐标说明',
    'tests/supplied_urdf_models.test.js': '软件测试：新增 URDF 连接树、网格、夹爪与原控制映射隔离',
    '.gitattributes': '固定 Linux 脚本 LF、Windows 脚本 CRLF 与二进制资源属性',
    '.gitignore': '排除客户数据、模型、环境、缓存、日志和生成包',
    '.github/workflows/ci.yml': 'GitHub 自动软件测试、组件校验与文件说明检查',
    'README.md': '客户入口、下载选择、两系统启动与教程索引',
    'THIRD_PARTY.md': '第三方组件来源、许可位置与资产说明',
    'package.json': 'ES module 配置、前端测试命令和 Playwright 开发依赖',
    'package-lock.json': '固定 Node 开发依赖解析版本',
    'start_ubuntu.sh': 'Ubuntu 检查并补齐系统依赖，使用系统 Python 启动网页与后台',
    'start_ubuntu_training_test.sh': 'Ubuntu 本地训练测试入口，拒绝复用旧版或仅有 API 的组件后台',
    'tools/package_training_local.py': '打包包含网页、训练后台与启动器的 Ubuntu 本地测试源码',
    'start_windows.bat': 'Windows 自动选择 Python 启动同一网页与后台',
    'start_windows_browser.bat': 'Windows 双击启动本地纯网页测试，不安装 Python 或设备后台',
    'tools/start_browser_local.ps1': '使用 Windows 自带 .NET，仅在环回地址提供静态网页与推理资源',
    'tools/package_browser_local.py': '生成 Windows 本地纯网页测试 ZIP，不包含训练后台或客户模型',
    'tests/test_browser_local.py': '软件测试：本地静态启动、模块与 WASM 类型、并发及请求边界',
    'Browser_SDK/index.html': 'Star Arm 102 控制台首页',
    'Browser_SDK/act-workbench.html': 'ACT 采集、训练、模型和执行四步骤页面',
    'Browser_SDK/downloads/act-runtime-template.deb': '通用 Ubuntu 组件模板，由网页绑定当前网站后下载',
    'runtime/ubuntu_runtime.py': '用户后台启动、网站授权、环回 API 与组件连接检测',
    'runtime/start_desktop_sessions.py': '安装后识别活动桌面用户并启动用户后台',
    'runtime/Browser_SDK/index.html': '安装组件自带的最小状态页面，完整界面在网站',
    'Browser_SDK/act-browser.html': '客户无需本机服务的 ACT 模型、双相机与串口执行网页',
    'tools/export_browser_act.py': '提供方网页模型转换的命令行入口，客户不运行',
    'tests/browser_direct_smoke.cjs': '无本机 API 的网页模型、相机、串口和停止流程；模拟硬件',
    'tools/serve_local.py': '源码启动入口，检查版本并同端口提供完整网页与 API',
    'tools/ubuntu_setup.py': 'Ubuntu 系统依赖与组件安装，等待 dpkg 锁、重试下载并解释失败原因',
    'tools/build_runtime_package.py': '构建 Debian 模板、桌面自启动、udev 与浏览器校验值',
    'tools/package_site.py': '生成含静态网站、图文教程和 SHA256 清单的单个交付 ZIP',
    'tools/capture_docs.cjs': '阻断本机硬件 API，以真实未连接界面生成教程截图',
    'tools/check_distribution.py': '校验安装模板、源码一致性、换行、静态文件与资源路径',
    'tools/check_file_map.py': '逐文件用途清单生成与遗漏检查',
    'tests/camera_navigation_smoke.cjs': '隔离端口与模拟双相机，验证步骤切换复用预览和过期状态处理',
    'tests/browser_smoke.cjs': '自动浏览器验证、临时本机服务与安装包生成检查',
    'tests/console_serial_smoke.cjs': '模拟控制台 LD/HD/FL 串口、首轮反馈、共享超时、补读与重新连接',
    'tests/act_workflow_smoke.cjs': 'Windows 四步骤默认入口、第 1 步服务配置、无训练依赖采集与多分辨率预览布局',
}
DOCS = {
    'BROWSER_EXECUTION': 'Windows 纯网页客户执行与提供方一键导出模型图文教程',
    'GETTING_STARTED': '图文快速上手、下载选择与已有模型 / 自训练路线',
    'CONSOLE_GUIDE': '控制台连接、三维查看、控制和舵机设置图文教程',
    'UBUNTU': 'Ubuntu 首次安装、本地启动、环境与数据目录教程',
    'WINDOWS': 'Windows 启动与功能支持范围教程', 'DEPLOYMENT': '服务器只上传静态文件的发布教程',
    'ACT_GUIDE': '采集、校准、训练、完整模型导入与执行教程',
    'ARCHITECTURE': '服务器、浏览器、本机后台与虚拟环境职责说明',
    'TROUBLESHOOTING': '启动、环境、设备、相机与导入问题排查',
    'DEVELOPMENT': '开发检查、打包、更新与持续集成教程', 'FILE_MAP': '本清单：每个仓库文件的用途',
}

DOC_IMAGES = {
    'windows-runtime-ready': 'Windows 实际 CPU 执行环境自检就绪界面（未连接硬件）',
    'windows-website-connection': 'Windows 当前网站本机连接确认页（本机测试地址）',
    'console-overview': '控制台全景', 'console-device-panel': '控制台设备连接面板',
    'console-servo-setup': '控制台舵机设置页面', 'workspace-transition': '全屏工作区切换动画',
    'act-collect-overview': 'ACT 数据采集全景', 'act-device-panel': 'ACT 设备连接面板',
    'act-collection-entry': '第 1 步采集连接与大画面入口（隔离服务、硬件未连接）',
    'act-inference-large-preview': '第 4 步双相机大预览与同屏曲线（硬件未连接）',
    'ubuntu-install-recovery': 'Ubuntu 安装故障帮助与重新检测入口（组件未连接）',
    'act-dataset-form': '数据集创建表单与未提交示例', 'act-calibration-dialog': '从臂校准窗口',
    'act-first-setup': 'Ubuntu 首次安装与环境配置入口', 'act-model-import': '模型管理与导入入口',
    'windows-browser-execution': 'Windows 纯网页执行全景，未连接硬件',
    'act-execution-overview': 'ACT 实机推理全景', 'act-execution-connections': '第 4 步从臂连接与校验门槛',
}


def files():
    return sorted((p for p in ROOT.rglob('*') if p.is_file() and not set(p.relative_to(ROOT).parts) & IGNORED
                   and p.suffix not in ('.pyc', '.log') and not p.name.startswith('.env')),
                  key=lambda p: p.relative_to(ROOT).as_posix())


def purpose(path):
    relative = path.relative_to(ROOT).as_posix()
    if relative == 'tools/check_latest_delivery.py':
        return '核验两份完整交付源码的文件清单与 SHA256，不启动设备'
    if relative == 'tools/refresh_latest_delivery.py':
        return '维护交付内容后更新包内校验文件和版本清单，再由打包工具生成 ZIP 摘要'
    if relative == 'tools/package_latest_delivery.py':
        return '将已核验的服务器版与 Lumos 本地版重新打包到 dist/latest-delivery'
    if relative.startswith('delivery/'):
        if path.name == 'manifest.json': return '最新交付版本、原 ZIP 信息与每个源文件的 SHA256'
        if relative == 'delivery/README.md': return '最新完整交付的下载、运行与打包入口'
        if '/assets/' in relative: return '完整交付所需的模型、压缩网格、前端库与许可资源'
        if path.suffix == '.deb': return '随完整服务器包提供的 Ubuntu 本机组件'
        if path.name in ('使用说明.txt', '部署说明.md'): return '该交付包的使用或部署说明'
        return '对应已交付 ZIP 的原始源文件：' + path.name
    if relative in EXACT:
        return EXACT[relative]
    if relative.startswith('docs/images/'):
        return '真实界面教程截图（硬件未连接）：' + DOC_IMAGES[path.stem]
    if relative.startswith('docs/') and path.stem in DOCS:
        return DOCS[path.stem]
    if relative.startswith('Browser_SDK/src/'):
        description = FRONTEND[path.stem]
        return description + ('（样式）' if path.suffix == '.css' else '')
    if relative.startswith('ai_service/vendor/'):
        if path.name == 'README.txt': return '离线原生 SDK / 串口 wheel 来源与 SHA256'
        if path.name.endswith('.LICENSE.txt'): return 'FashionStar SDK 随附的原始许可文本'
        return ('FashionStar 官方 UART SDK 1.3.6 离线依赖' if path.name.startswith('fashionstar')
                else 'pyserial 3.5 离线串口依赖，wheel 内含许可')
    if relative.startswith('ai_service/'):
        return BACKEND[path.stem]
    if relative.startswith('tests/'):
        stem = path.stem.removesuffix('.test').removeprefix('test_')
        test_names = {
            'new_ui_i18n': '新增工作区和 Lumos 面板中英文、动态错误、变量保留与日志保护',
            'urdf_asset_loading': '模型网格并发、嵌套路径、网络重试、错误定位与切换释放',
            'training_submission': '训练提交编号匹配、旧后台任务核对与准备阶段防重复提交',
            'api': 'HTTP API、数据集与轮次流程', 'api_client': '请求及响应体超时、取消与禁止自动重试', 'page_lifecycle': '停止和释放成功后切页、失败保留原页与重复点击合并', 'native_camera_api': '原生相机 HTTP API',
            'native_camera_manager': '原生双相机管理', 'native_cameras_streaming': '原生相机流与结束排空',
            'windows_execution': 'Windows COM 官方驱动读写、双相机与固定目录 CPU 环境',
            'release_version_contract': '两系统启动脚本与整合服务入口',
            'ubuntu_setup': 'Ubuntu 授权、锁等待选项、安装失败提示、中断恢复与重复启动',
            'piper_leader_contract': 'PiPER Mate 姿态源配置与显示约束',
            'piper_readback_zero': 'PiPER 实时角度、J3 多圈与夹爪中心线',
            'piper_joint_direction': 'PiPER 关节方向', 'piper_ground_pose': 'PiPER 贴地显示姿态',
            'servo_setup_ui_contract': '舵机设置界面与读写错误显示',
            'fl_trajectory_ui_contract': '轨迹编辑界面约束', 'model_import_ui': '完整模型导入界面',
            'follower_calibration_ui': '从臂校准与重试界面', 'act_workbench_contract': 'ACT 页面结构与流程约束',
        }
        if stem in test_names: return '软件测试：' + test_names[stem]
        module = stem.replace('act_', 'act-', 1).replace('_', '-') if stem.startswith('act_') else stem
        description = BACKEND.get(stem) or FRONTEND.get(module) or FRONTEND.get(stem)
        if description: return '软件测试：' + description
        raise ValueError('缺少测试用途：' + relative)
    if relative.startswith('Browser_SDK/assets/models/'):
        return f'{path.parent.name} 模型的 {path.stem} 零件三角网格，用于 3D 显示'
    if relative.startswith('Browser_SDK/assets/urdf/'):
        kind = {'.stl': '原始三角网格', '.STL': '原始三角网格', '.urdf': '关节、坐标和连杆结构', '.csv': 'CAD 导出的关节配置表'}
        label = {'parts.json': '导出零件映射', 'export_report.json': '模型导出坐标与警告报告'}
        return f'{path.parent.name} 模型的 ' + label.get(path.name, kind.get(path.suffix, '未知'))
    if relative.startswith('Browser_SDK/assets/vendor/onnxruntime-web/'):
        return {'LICENSE.txt': 'ONNX Runtime Web 的 MIT 许可证', 'package-version.json': 'npm 原包版本和 SHA512 完整性信息',
                'ort.webgpu.min.js': '自托管 ONNX Runtime WebGPU JavaScript 引擎入口',
                'ort-wasm-simd-threaded.asyncify.js': 'WebGPU 引擎的异步 WASM 模块胶水代码',
                'ort-wasm-simd-threaded.asyncify.wasm': '浏览器直接运行的 WebGPU / WASM 推理实现'}[path.name]
    if relative.startswith('Browser_SDK/assets/vendor/fflate/'):
        return {'LICENSE.txt': 'fflate 的 MIT 许可证', 'package-version.json': 'npm 原包版本和 SHA512 完整性信息',
                'browser.js': '网页模型 ZIP 解压库，运行在 Worker 中'}[path.name]
    if relative.startswith('Browser_SDK/assets/vendor/'):
        return {'three.module.js': 'Three.js 模块入口与 WebGL 实现', 'three.core.js': 'Three.js 几何、场景、材质与数学核心',
                'OrbitControls.js': '3D 视角旋转、缩放与平移控件', 'STLLoader.js': '加载机械臂 STL 三角网格',
                'lucide-icons.svg': '自托管 Lucide 0.468.0 开源图标精灵，用于舵机配置页面',
                'lucide-LICENSE.txt': 'Lucide 图标原始 ISC 许可证与来源版权声明'}[path.name]
    if relative.startswith('Browser_SDK/assets/'):
        return {'resource-manifest.json': '本地模型与显示资源清单', 'icon.png': '网站图标', 'logo-icon.png': '品牌图标与组件桌面图标',
                'logo-full.png': '完整品牌图像', 'logo.svg': '品牌矢量图标'}[path.name]
    raise ValueError('缺少文件用途：' + relative)


def render():
    rows = ['# 每个文件的用途', '', '自动清单覆盖所有源码、教程、测试和静态资源；不包含 `.git`、环境、缓存、生成包或客户数据。', '',
            '| 目录 | 用途 |', '| --- | --- |', '| `Browser_SDK/` | 可直接上传的静态网站 |',
            '| `ai_service/` | 客户电脑执行的后台 |', '| `runtime/` | Ubuntu 组件和会话启动 |',
            '| `tools/` | 本地启动、构建与发布校验 |', '| `tests/` | 软件与浏览器检查 |',
            '| `docs/` | 中文教程与文件说明 |', '', '| 文件 | 作用 |', '| --- | --- |']
    for path in files():
        relative = path.relative_to(ROOT).as_posix()
        rows.append(f'| [{relative}](../{relative}) | {purpose(path)} |')
    return '\n'.join(rows) + '\n'


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--write', action='store_true')
    args = parser.parse_args()
    target = ROOT / 'docs/FILE_MAP.md'
    if args.write:
        target.touch(exist_ok=True)
        target.write_text(render(), encoding='utf-8', newline='\n')
    elif target.read_text(encoding='utf-8') != render():
        raise SystemExit('文件说明过期，请运行 python tools/check_file_map.py --write')
    print(f'已检查 {len(files())} 个文件的用途说明')


if __name__ == '__main__': main()
