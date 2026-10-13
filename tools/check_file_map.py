"""Generate/check a purpose entry for every distributable repository file."""
import argparse
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
IGNORED = {'.git', '__pycache__', 'node_modules', 'dist', '.venv', '.local-state'}

FRONTEND = {
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
    'servo_setup_flow': '舵机 ID 和参数设置的读写校验流程', 'servo_setup': '舵机设置界面与设备操作',
    'settings': '控制台用户设置与持久化', 'styles': '控制台主题、响应式布局和通用控件样式',
    'target_execution_ownership': '确保运动目标同一时间由一个执行者持有', 'tcp_drag_preview': '拖动末端时的目标预览',
    'tcp_translation_gizmo': '3D 末端平移操作控件', 'teleop_controller': '主从臂遥操作与周期控制',
    'version': '原控制台版本显示信息', 'workspace-switch': '控制台与 ACT 的全屏能量环切换、倒计时与取消',
}
BACKEND = {
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
    'training_manifest': 'Python / LeRobot / PyTorch 版本及加速源清单',
}
EXACT = {
    '.gitattributes': '固定 Linux 脚本 LF、Windows 脚本 CRLF 与二进制资源属性',
    '.gitignore': '排除客户数据、模型、环境、缓存、日志和生成包',
    '.github/workflows/ci.yml': 'GitHub 自动软件测试、组件校验与文件说明检查',
    'README.md': '客户入口、下载选择、两系统启动与教程索引',
    'THIRD_PARTY.md': '第三方组件来源、许可位置与资产说明',
    'package.json': 'ES module 配置、前端测试命令和 Playwright 开发依赖',
    'package-lock.json': '固定 Node 开发依赖解析版本',
    'start_ubuntu.sh': 'Ubuntu 一步启动本机网页与后台并打开浏览器',
    'start_windows.bat': 'Windows 自动选择 Python 启动同一网页与后台',
    'Browser_SDK/index.html': 'Star Arm 102 控制台首页',
    'Browser_SDK/act-workbench.html': 'ACT 采集、训练、模型和执行四步骤页面',
    'Browser_SDK/downloads/act-runtime-template.deb': '通用 Ubuntu 组件模板，由网页绑定当前网站后下载',
    'runtime/ubuntu_runtime.py': '用户后台启动、网站授权、环回 API 与组件连接检测',
    'runtime/start_desktop_sessions.py': '安装后识别活动桌面用户并启动用户后台',
    'runtime/Browser_SDK/index.html': '安装组件自带的最小状态页面，完整界面在网站',
    'tools/serve_local.py': '源码启动入口，检查版本并同端口提供完整网页与 API',
    'tools/build_runtime_package.py': '构建 Debian 模板、桌面自启动、udev 与浏览器校验值',
    'tools/package_site.py': '生成含静态网站、图文教程和 SHA256 清单的单个交付 ZIP',
    'tools/capture_docs.cjs': '阻断本机硬件 API，以真实未连接界面生成教程截图',
    'tools/check_distribution.py': '校验安装模板、源码一致性、换行、静态文件与资源路径',
    'tools/check_file_map.py': '逐文件用途清单生成与遗漏检查',
    'tests/browser_smoke.cjs': '自动浏览器验证、临时本机服务与安装包生成检查',
}
DOCS = {
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
    'act-dataset-form': '数据集创建表单与未提交示例', 'act-calibration-dialog': '从臂校准窗口',
    'act-first-setup': 'Ubuntu 首次安装与环境配置入口', 'act-model-import': '模型管理与导入入口',
    'act-execution-overview': 'ACT 实机推理全景', 'act-execution-connections': '第 4 步从臂连接与校验门槛',
}


def files():
    return sorted((p for p in ROOT.rglob('*') if p.is_file() and not set(p.relative_to(ROOT).parts) & IGNORED
                   and p.suffix not in ('.pyc', '.log') and not p.name.startswith('.env')),
                  key=lambda p: p.relative_to(ROOT).as_posix())


def purpose(path):
    relative = path.relative_to(ROOT).as_posix()
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
            'api': 'HTTP API、数据集与轮次流程', 'api_client': '请求及响应体超时、取消与禁止自动重试', 'page_lifecycle': '停止和释放成功后切页、失败保留原页与重复点击合并', 'native_camera_api': '原生相机 HTTP API',
            'native_camera_manager': '原生双相机管理', 'native_cameras_streaming': '原生相机流与结束排空',
            'windows_execution': 'Windows COM 官方驱动读写、双相机与固定目录 CPU 环境',
            'release_version_contract': '两系统启动脚本与整合服务入口',
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
        kind = {'.urdf': '关节、坐标和连杆结构', '.csv': 'CAD 导出的关节配置表'}
        label = {'parts.json': '导出零件映射', 'export_report.json': '模型导出坐标与警告报告'}
        return f'{path.parent.name} 模型的 ' + label.get(path.name, kind.get(path.suffix, '未知'))
    if relative.startswith('Browser_SDK/assets/vendor/'):
        return {'three.module.js': 'Three.js 模块入口与 WebGL 实现', 'three.core.js': 'Three.js 几何、场景、材质与数学核心',
                'OrbitControls.js': '3D 视角旋转、缩放与平移控件', 'STLLoader.js': '加载机械臂 STL 三角网格'}[path.name]
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
