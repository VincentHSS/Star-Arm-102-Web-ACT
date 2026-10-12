# 每个文件的用途

自动清单覆盖所有源码、教程、测试和静态资源；不包含 `.git`、环境、缓存、生成包或客户数据。

| 目录 | 用途 |
| --- | --- |
| `Browser_SDK/` | 可直接上传的静态网站 |
| `ai_service/` | 客户电脑执行的后台 |
| `runtime/` | Ubuntu 组件和会话启动 |
| `tools/` | 本地启动、构建与发布校验 |
| `tests/` | 软件与浏览器检查 |
| `docs/` | 中文教程与文件说明 |

| 文件 | 作用 |
| --- | --- |
| [.gitattributes](../.gitattributes) | 固定 Linux 脚本 LF、Windows 脚本 CRLF 与二进制资源属性 |
| [.github/workflows/ci.yml](../.github/workflows/ci.yml) | GitHub 自动软件测试、组件校验与文件说明检查 |
| [.gitignore](../.gitignore) | 排除客户数据、模型、环境、缓存、日志和生成包 |
| [Browser_SDK/act-workbench.html](../Browser_SDK/act-workbench.html) | ACT 采集、训练、模型和执行四步骤页面 |
| [Browser_SDK/assets/icon.png](../Browser_SDK/assets/icon.png) | 网站图标 |
| [Browser_SDK/assets/logo-full.png](../Browser_SDK/assets/logo-full.png) | 完整品牌图像 |
| [Browser_SDK/assets/logo-icon.png](../Browser_SDK/assets/logo-icon.png) | 品牌图标与组件桌面图标 |
| [Browser_SDK/assets/logo.svg](../Browser_SDK/assets/logo.svg) | 品牌矢量图标 |
| [Browser_SDK/assets/models/a1z-gripper/arm_link1.STL](../Browser_SDK/assets/models/a1z-gripper/arm_link1.STL) | a1z-gripper 模型的 arm_link1 零件三角网格，用于 3D 显示 |
| [Browser_SDK/assets/models/a1z-gripper/arm_link2.stl](../Browser_SDK/assets/models/a1z-gripper/arm_link2.stl) | a1z-gripper 模型的 arm_link2 零件三角网格，用于 3D 显示 |
| [Browser_SDK/assets/models/a1z-gripper/arm_link3.stl](../Browser_SDK/assets/models/a1z-gripper/arm_link3.stl) | a1z-gripper 模型的 arm_link3 零件三角网格，用于 3D 显示 |
| [Browser_SDK/assets/models/a1z-gripper/arm_link4.stl](../Browser_SDK/assets/models/a1z-gripper/arm_link4.stl) | a1z-gripper 模型的 arm_link4 零件三角网格，用于 3D 显示 |
| [Browser_SDK/assets/models/a1z-gripper/arm_link5.stl](../Browser_SDK/assets/models/a1z-gripper/arm_link5.stl) | a1z-gripper 模型的 arm_link5 零件三角网格，用于 3D 显示 |
| [Browser_SDK/assets/models/a1z-gripper/arm_link6.stl](../Browser_SDK/assets/models/a1z-gripper/arm_link6.stl) | a1z-gripper 模型的 arm_link6 零件三角网格，用于 3D 显示 |
| [Browser_SDK/assets/models/a1z-gripper/base_link.stl](../Browser_SDK/assets/models/a1z-gripper/base_link.stl) | a1z-gripper 模型的 base_link 零件三角网格，用于 3D 显示 |
| [Browser_SDK/assets/models/a1z-gripper/gripper_finger_left_link.stl](../Browser_SDK/assets/models/a1z-gripper/gripper_finger_left_link.stl) | a1z-gripper 模型的 gripper_finger_left_link 零件三角网格，用于 3D 显示 |
| [Browser_SDK/assets/models/a1z-gripper/gripper_finger_right_link.stl](../Browser_SDK/assets/models/a1z-gripper/gripper_finger_right_link.stl) | a1z-gripper 模型的 gripper_finger_right_link 零件三角网格，用于 3D 显示 |
| [Browser_SDK/assets/models/a1z/arm_link1.STL](../Browser_SDK/assets/models/a1z/arm_link1.STL) | a1z 模型的 arm_link1 零件三角网格，用于 3D 显示 |
| [Browser_SDK/assets/models/a1z/arm_link2.STL](../Browser_SDK/assets/models/a1z/arm_link2.STL) | a1z 模型的 arm_link2 零件三角网格，用于 3D 显示 |
| [Browser_SDK/assets/models/a1z/arm_link3.STL](../Browser_SDK/assets/models/a1z/arm_link3.STL) | a1z 模型的 arm_link3 零件三角网格，用于 3D 显示 |
| [Browser_SDK/assets/models/a1z/arm_link4.STL](../Browser_SDK/assets/models/a1z/arm_link4.STL) | a1z 模型的 arm_link4 零件三角网格，用于 3D 显示 |
| [Browser_SDK/assets/models/a1z/arm_link5.STL](../Browser_SDK/assets/models/a1z/arm_link5.STL) | a1z 模型的 arm_link5 零件三角网格，用于 3D 显示 |
| [Browser_SDK/assets/models/a1z/arm_link6.STL](../Browser_SDK/assets/models/a1z/arm_link6.STL) | a1z 模型的 arm_link6 零件三角网格，用于 3D 显示 |
| [Browser_SDK/assets/models/a1z/base_link.STL](../Browser_SDK/assets/models/a1z/base_link.STL) | a1z 模型的 base_link 零件三角网格，用于 3D 显示 |
| [Browser_SDK/assets/models/a1z/gripper_finger_left_link.STL](../Browser_SDK/assets/models/a1z/gripper_finger_left_link.STL) | a1z 模型的 gripper_finger_left_link 零件三角网格，用于 3D 显示 |
| [Browser_SDK/assets/models/a1z/gripper_finger_right_link.STL](../Browser_SDK/assets/models/a1z/gripper_finger_right_link.STL) | a1z 模型的 gripper_finger_right_link 零件三角网格，用于 3D 显示 |
| [Browser_SDK/assets/models/b601-gripper/gripper_left.STL](../Browser_SDK/assets/models/b601-gripper/gripper_left.STL) | b601-gripper 模型的 gripper_left 零件三角网格，用于 3D 显示 |
| [Browser_SDK/assets/models/b601-gripper/gripper_link.STL](../Browser_SDK/assets/models/b601-gripper/gripper_link.STL) | b601-gripper 模型的 gripper_link 零件三角网格，用于 3D 显示 |
| [Browser_SDK/assets/models/b601-gripper/gripper_right.STL](../Browser_SDK/assets/models/b601-gripper/gripper_right.STL) | b601-gripper 模型的 gripper_right 零件三角网格，用于 3D 显示 |
| [Browser_SDK/assets/models/b601-gripper/link6.STL](../Browser_SDK/assets/models/b601-gripper/link6.STL) | b601-gripper 模型的 link6 零件三角网格，用于 3D 显示 |
| [Browser_SDK/assets/models/b601/base_link.STL](../Browser_SDK/assets/models/b601/base_link.STL) | b601 模型的 base_link 零件三角网格，用于 3D 显示 |
| [Browser_SDK/assets/models/b601/end_link.STL](../Browser_SDK/assets/models/b601/end_link.STL) | b601 模型的 end_link 零件三角网格，用于 3D 显示 |
| [Browser_SDK/assets/models/b601/link1.STL](../Browser_SDK/assets/models/b601/link1.STL) | b601 模型的 link1 零件三角网格，用于 3D 显示 |
| [Browser_SDK/assets/models/b601/link2.STL](../Browser_SDK/assets/models/b601/link2.STL) | b601 模型的 link2 零件三角网格，用于 3D 显示 |
| [Browser_SDK/assets/models/b601/link3.STL](../Browser_SDK/assets/models/b601/link3.STL) | b601 模型的 link3 零件三角网格，用于 3D 显示 |
| [Browser_SDK/assets/models/b601/link4.STL](../Browser_SDK/assets/models/b601/link4.STL) | b601 模型的 link4 零件三角网格，用于 3D 显示 |
| [Browser_SDK/assets/models/b601/link5.STL](../Browser_SDK/assets/models/b601/link5.STL) | b601 模型的 link5 零件三角网格，用于 3D 显示 |
| [Browser_SDK/assets/models/b601/link6.STL](../Browser_SDK/assets/models/b601/link6.STL) | b601 模型的 link6 零件三角网格，用于 3D 显示 |
| [Browser_SDK/assets/models/fl/base_link.STL](../Browser_SDK/assets/models/fl/base_link.STL) | fl 模型的 base_link 零件三角网格，用于 3D 显示 |
| [Browser_SDK/assets/models/fl/link1.STL](../Browser_SDK/assets/models/fl/link1.STL) | fl 模型的 link1 零件三角网格，用于 3D 显示 |
| [Browser_SDK/assets/models/fl/link2.STL](../Browser_SDK/assets/models/fl/link2.STL) | fl 模型的 link2 零件三角网格，用于 3D 显示 |
| [Browser_SDK/assets/models/fl/link3.STL](../Browser_SDK/assets/models/fl/link3.STL) | fl 模型的 link3 零件三角网格，用于 3D 显示 |
| [Browser_SDK/assets/models/fl/link4.STL](../Browser_SDK/assets/models/fl/link4.STL) | fl 模型的 link4 零件三角网格，用于 3D 显示 |
| [Browser_SDK/assets/models/fl/link5.STL](../Browser_SDK/assets/models/fl/link5.STL) | fl 模型的 link5 零件三角网格，用于 3D 显示 |
| [Browser_SDK/assets/models/fl/link6.STL](../Browser_SDK/assets/models/fl/link6.STL) | fl 模型的 link6 零件三角网格，用于 3D 显示 |
| [Browser_SDK/assets/models/fl/link7_left.STL](../Browser_SDK/assets/models/fl/link7_left.STL) | fl 模型的 link7_left 零件三角网格，用于 3D 显示 |
| [Browser_SDK/assets/models/fl/link7_right.STL](../Browser_SDK/assets/models/fl/link7_right.STL) | fl 模型的 link7_right 零件三角网格，用于 3D 显示 |
| [Browser_SDK/assets/models/ld/base_link.STL](../Browser_SDK/assets/models/ld/base_link.STL) | ld 模型的 base_link 零件三角网格，用于 3D 显示 |
| [Browser_SDK/assets/models/ld/link1.STL](../Browser_SDK/assets/models/ld/link1.STL) | ld 模型的 link1 零件三角网格，用于 3D 显示 |
| [Browser_SDK/assets/models/ld/link2.STL](../Browser_SDK/assets/models/ld/link2.STL) | ld 模型的 link2 零件三角网格，用于 3D 显示 |
| [Browser_SDK/assets/models/ld/link3.STL](../Browser_SDK/assets/models/ld/link3.STL) | ld 模型的 link3 零件三角网格，用于 3D 显示 |
| [Browser_SDK/assets/models/ld/link4.STL](../Browser_SDK/assets/models/ld/link4.STL) | ld 模型的 link4 零件三角网格，用于 3D 显示 |
| [Browser_SDK/assets/models/ld/link5.STL](../Browser_SDK/assets/models/ld/link5.STL) | ld 模型的 link5 零件三角网格，用于 3D 显示 |
| [Browser_SDK/assets/models/ld/link6.STL](../Browser_SDK/assets/models/ld/link6.STL) | ld 模型的 link6 零件三角网格，用于 3D 显示 |
| [Browser_SDK/assets/models/ld/link7_left.STL](../Browser_SDK/assets/models/ld/link7_left.STL) | ld 模型的 link7_left 零件三角网格，用于 3D 显示 |
| [Browser_SDK/assets/models/ld/link7_right.STL](../Browser_SDK/assets/models/ld/link7_right.STL) | ld 模型的 link7_right 零件三角网格，用于 3D 显示 |
| [Browser_SDK/assets/models/piper/base_link.STL](../Browser_SDK/assets/models/piper/base_link.STL) | piper 模型的 base_link 零件三角网格，用于 3D 显示 |
| [Browser_SDK/assets/models/piper/link1.STL](../Browser_SDK/assets/models/piper/link1.STL) | piper 模型的 link1 零件三角网格，用于 3D 显示 |
| [Browser_SDK/assets/models/piper/link2.STL](../Browser_SDK/assets/models/piper/link2.STL) | piper 模型的 link2 零件三角网格，用于 3D 显示 |
| [Browser_SDK/assets/models/piper/link3.STL](../Browser_SDK/assets/models/piper/link3.STL) | piper 模型的 link3 零件三角网格，用于 3D 显示 |
| [Browser_SDK/assets/models/piper/link4.STL](../Browser_SDK/assets/models/piper/link4.STL) | piper 模型的 link4 零件三角网格，用于 3D 显示 |
| [Browser_SDK/assets/models/piper/link6.STL](../Browser_SDK/assets/models/piper/link6.STL) | piper 模型的 link6 零件三角网格，用于 3D 显示 |
| [Browser_SDK/assets/models/piper/link7_left.STL](../Browser_SDK/assets/models/piper/link7_left.STL) | piper 模型的 link7_left 零件三角网格，用于 3D 显示 |
| [Browser_SDK/assets/models/piper/link7_right.STL](../Browser_SDK/assets/models/piper/link7_right.STL) | piper 模型的 link7_right 零件三角网格，用于 3D 显示 |
| [Browser_SDK/assets/models/piper/link_5.STL](../Browser_SDK/assets/models/piper/link_5.STL) | piper 模型的 link_5 零件三角网格，用于 3D 显示 |
| [Browser_SDK/assets/resource-manifest.json](../Browser_SDK/assets/resource-manifest.json) | 本地模型与显示资源清单 |
| [Browser_SDK/assets/urdf/a1z/A1Z_G1Z_with_gripper.urdf](../Browser_SDK/assets/urdf/a1z/A1Z_G1Z_with_gripper.urdf) | a1z 模型的 关节、坐标和连杆结构 |
| [Browser_SDK/assets/urdf/a1z/model.urdf](../Browser_SDK/assets/urdf/a1z/model.urdf) | a1z 模型的 关节、坐标和连杆结构 |
| [Browser_SDK/assets/urdf/b601/reBot-DevArm_fixend.csv](../Browser_SDK/assets/urdf/b601/reBot-DevArm_fixend.csv) | b601 模型的 CAD 导出的关节配置表 |
| [Browser_SDK/assets/urdf/b601/reBot-DevArm_fixend.urdf](../Browser_SDK/assets/urdf/b601/reBot-DevArm_fixend.urdf) | b601 模型的 关节、坐标和连杆结构 |
| [Browser_SDK/assets/urdf/b601/reBot_B601_DM_with_gripper.urdf](../Browser_SDK/assets/urdf/b601/reBot_B601_DM_with_gripper.urdf) | b601 模型的 关节、坐标和连杆结构 |
| [Browser_SDK/assets/urdf/ld/model.urdf](../Browser_SDK/assets/urdf/ld/model.urdf) | ld 模型的 关节、坐标和连杆结构 |
| [Browser_SDK/assets/urdf/piper/export_report.json](../Browser_SDK/assets/urdf/piper/export_report.json) | piper 模型的 模型导出坐标与警告报告 |
| [Browser_SDK/assets/urdf/piper/model.urdf](../Browser_SDK/assets/urdf/piper/model.urdf) | piper 模型的 关节、坐标和连杆结构 |
| [Browser_SDK/assets/urdf/piper/parts.json](../Browser_SDK/assets/urdf/piper/parts.json) | piper 模型的 导出零件映射 |
| [Browser_SDK/assets/vendor/OrbitControls.js](../Browser_SDK/assets/vendor/OrbitControls.js) | 3D 视角旋转、缩放与平移控件 |
| [Browser_SDK/assets/vendor/STLLoader.js](../Browser_SDK/assets/vendor/STLLoader.js) | 加载机械臂 STL 三角网格 |
| [Browser_SDK/assets/vendor/three.core.js](../Browser_SDK/assets/vendor/three.core.js) | Three.js 几何、场景、材质与数学核心 |
| [Browser_SDK/assets/vendor/three.module.js](../Browser_SDK/assets/vendor/three.module.js) | Three.js 模块入口与 WebGL 实现 |
| [Browser_SDK/downloads/act-runtime-template.deb](../Browser_SDK/downloads/act-runtime-template.deb) | 通用 Ubuntu 组件模板，由网页绑定当前网站后下载 |
| [Browser_SDK/index.html](../Browser_SDK/index.html) | Star Arm 102 控制台首页 |
| [Browser_SDK/src/a1z_model_data.js](../Browser_SDK/src/a1z_model_data.js) | A1Z 3D 零件与关节数据 |
| [Browser_SDK/src/act-camera-frame-encoder-worker-client.js](../Browser_SDK/src/act-camera-frame-encoder-worker-client.js) | 管理相机编码 Worker 请求、超时与退出 |
| [Browser_SDK/src/act-camera-frame-encoder-worker.js](../Browser_SDK/src/act-camera-frame-encoder-worker.js) | 在后台 Worker 中编码相机 JPEG，减少主界面阻塞 |
| [Browser_SDK/src/act-camera-frame-uploader.js](../Browser_SDK/src/act-camera-frame-uploader.js) | 管理双相机帧上传队列、批次与结束排空 |
| [Browser_SDK/src/act-camera-state.js](../Browser_SDK/src/act-camera-state.js) | 统一相机连接、采集和丢帧状态 |
| [Browser_SDK/src/act-cameras.js](../Browser_SDK/src/act-cameras.js) | ACT 相机设备选择、角色绑定与预览 |
| [Browser_SDK/src/act-capture-quality.js](../Browser_SDK/src/act-capture-quality.js) | 采集同步质量和帧率统计 |
| [Browser_SDK/src/act-inference.css](../Browser_SDK/src/act-inference.css) | 执行诊断面板与推理界面样式（样式） |
| [Browser_SDK/src/act-installer.js](../Browser_SDK/src/act-installer.js) | 验证模板并生成绑定当前网站的 Ubuntu 安装包 |
| [Browser_SDK/src/act-motion.js](../Browser_SDK/src/act-motion.js) | ACT 元素出现、退出和交互过渡 |
| [Browser_SDK/src/act-ui-refresh.css](../Browser_SDK/src/act-ui-refresh.css) | ACT 面板布局、空相机状态与交互视觉样式（样式） |
| [Browser_SDK/src/act-waveform.js](../Browser_SDK/src/act-waveform.js) | Action / State 多通道曲线、时间轴与绘制 |
| [Browser_SDK/src/act-workbench.css](../Browser_SDK/src/act-workbench.css) | ACT 四步骤工作台的流程、API、采集、训练和模型执行交互（样式） |
| [Browser_SDK/src/act-workbench.js](../Browser_SDK/src/act-workbench.js) | ACT 四步骤工作台的流程、API、采集、训练和模型执行交互 |
| [Browser_SDK/src/api-client.js](../Browser_SDK/src/api-client.js) | 本机 API 请求与响应体超时、错误反馈和取消管理 |
| [Browser_SDK/src/app.js](../Browser_SDK/src/app.js) | 控制台入口：初始化 3D、机械臂、串口和界面事件 |
| [Browser_SDK/src/b601_model_data.js](../Browser_SDK/src/b601_model_data.js) | B601 显示模型的零件与关节数据 |
| [Browser_SDK/src/browser_serial_utils.js](../Browser_SDK/src/browser_serial_utils.js) | 浏览器串口超时、读取与可取消任务工具 |
| [Browser_SDK/src/command_execution.js](../Browser_SDK/src/command_execution.js) | 协调控制指令执行和停止 |
| [Browser_SDK/src/control_lifecycle.js](../Browser_SDK/src/control_lifecycle.js) | 管理控制会话生命周期与资源释放 |
| [Browser_SDK/src/control_safety.js](../Browser_SDK/src/control_safety.js) | 控制台运动限位、约束与安全检查 |
| [Browser_SDK/src/factory_params.js](../Browser_SDK/src/factory_params.js) | 舵机工厂参数定义、解析与验证 |
| [Browser_SDK/src/factory_restore.js](../Browser_SDK/src/factory_restore.js) | 恢复舵机工厂参数的流程 |
| [Browser_SDK/src/fashionstar_serial.js](../Browser_SDK/src/fashionstar_serial.js) | FashionStar 浏览器串口协议封装 |
| [Browser_SDK/src/fl_trajectory_controller.js](../Browser_SDK/src/fl_trajectory_controller.js) | 从臂轨迹播放、暂停、停止和指令调度 |
| [Browser_SDK/src/fl_trajectory_model.js](../Browser_SDK/src/fl_trajectory_model.js) | 从臂轨迹结构、插值与关节模型 |
| [Browser_SDK/src/fl_trajectory_preview.js](../Browser_SDK/src/fl_trajectory_preview.js) | 从臂轨迹的 3D 预览 |
| [Browser_SDK/src/fl_trajectory_store.js](../Browser_SDK/src/fl_trajectory_store.js) | 从臂轨迹持久化、导入与导出 |
| [Browser_SDK/src/fl_trajectory_styles.css](../Browser_SDK/src/fl_trajectory_styles.css) | 从臂轨迹编辑面板样式（样式） |
| [Browser_SDK/src/fl_trajectory_workspace.js](../Browser_SDK/src/fl_trajectory_workspace.js) | 从臂轨迹工作区界面和操作 |
| [Browser_SDK/src/follower_target.js](../Browser_SDK/src/follower_target.js) | 从臂目标与实际关节状态转换 |
| [Browser_SDK/src/i18n.js](../Browser_SDK/src/i18n.js) | 控制台中英文文本 |
| [Browser_SDK/src/ik_solver.js](../Browser_SDK/src/ik_solver.js) | 末端逆运动学求解 |
| [Browser_SDK/src/interaction.css](../Browser_SDK/src/interaction.css) | 按钮处理提示与页面切换状态样式（样式） |
| [Browser_SDK/src/joint_mapper.js](../Browser_SDK/src/joint_mapper.js) | 舵机角度与显示模型关节方向映射 |
| [Browser_SDK/src/joint_slider_control.js](../Browser_SDK/src/joint_slider_control.js) | 关节滑条输入与连续控制 |
| [Browser_SDK/src/local-service.js](../Browser_SDK/src/local-service.js) | 本机后台探测、组件下载与环境准备接续 |
| [Browser_SDK/src/manual_control_session.js](../Browser_SDK/src/manual_control_session.js) | 手动控制会话的启动、结束与指令管理 |
| [Browser_SDK/src/page-lifecycle.js](../Browser_SDK/src/page-lifecycle.js) | 页面切换前停止控制、释放串口与按钮处理状态 |
| [Browser_SDK/src/piper_model_data.js](../Browser_SDK/src/piper_model_data.js) | PiPER Mate 烘焙模型与关节原始数据 |
| [Browser_SDK/src/rate_meter.js](../Browser_SDK/src/rate_meter.js) | 采样与通信频率统计 |
| [Browser_SDK/src/reset_origin.js](../Browser_SDK/src/reset_origin.js) | 机械臂回零与原点重置 |
| [Browser_SDK/src/robot_model.js](../Browser_SDK/src/robot_model.js) | 创建 3D 关节树并应用实际关节角度 |
| [Browser_SDK/src/robot_model_configs.js](../Browser_SDK/src/robot_model_configs.js) | 可选显示模型、关节与资源配置 |
| [Browser_SDK/src/robot_profiles.js](../Browser_SDK/src/robot_profiles.js) | 主从臂型号、关节范围和控制配置 |
| [Browser_SDK/src/runtime_integration.js](../Browser_SDK/src/runtime_integration.js) | 控制台运行状态与设备控制的集成 |
| [Browser_SDK/src/serial_servo_bus.js](../Browser_SDK/src/serial_servo_bus.js) | 舵机总线串口收发与响应管理 |
| [Browser_SDK/src/servo_setup.js](../Browser_SDK/src/servo_setup.js) | 舵机设置界面与设备操作 |
| [Browser_SDK/src/servo_setup_flow.js](../Browser_SDK/src/servo_setup_flow.js) | 舵机 ID 和参数设置的读写校验流程 |
| [Browser_SDK/src/settings.js](../Browser_SDK/src/settings.js) | 控制台用户设置与持久化 |
| [Browser_SDK/src/styles.css](../Browser_SDK/src/styles.css) | 控制台主题、响应式布局和通用控件样式（样式） |
| [Browser_SDK/src/target_execution_ownership.js](../Browser_SDK/src/target_execution_ownership.js) | 确保运动目标同一时间由一个执行者持有 |
| [Browser_SDK/src/tcp_drag_preview.js](../Browser_SDK/src/tcp_drag_preview.js) | 拖动末端时的目标预览 |
| [Browser_SDK/src/tcp_translation_gizmo.js](../Browser_SDK/src/tcp_translation_gizmo.js) | 3D 末端平移操作控件 |
| [Browser_SDK/src/teleop_controller.js](../Browser_SDK/src/teleop_controller.js) | 主从臂遥操作与周期控制 |
| [Browser_SDK/src/urdf_model_data.js](../Browser_SDK/src/urdf_model_data.js) | 原始机械臂 URDF 转换后的显示数据 |
| [Browser_SDK/src/version.js](../Browser_SDK/src/version.js) | 原控制台版本显示信息 |
| [Browser_SDK/src/workspace-switch.css](../Browser_SDK/src/workspace-switch.css) | 控制台与 ACT 的全屏能量环切换、倒计时与取消（样式） |
| [Browser_SDK/src/workspace-switch.js](../Browser_SDK/src/workspace-switch.js) | 控制台与 ACT 的全屏能量环切换、倒计时与取消 |
| [README.md](../README.md) | 客户入口、下载选择、两系统启动与教程索引 |
| [THIRD_PARTY.md](../THIRD_PARTY.md) | 第三方组件来源、许可位置与资产说明 |
| [ai_service/__init__.py](../ai_service/__init__.py) | Python 后台包入口 |
| [ai_service/act_policy_worker.py](../ai_service/act_policy_worker.py) | 独立进程加载 ACT 策略并产生预测动作 |
| [ai_service/action_schedule.py](../ai_service/action_schedule.py) | 动作块队列、节拍调度与多次预测融合 |
| [ai_service/app.py](../ai_service/app.py) | 本机 HTTP API、静态页面与资源生命周期 |
| [ai_service/capabilities.py](../ai_service/capabilities.py) | 检测 Python、训练依赖、GPU 与运行阻碍 |
| [ai_service/devices.py](../ai_service/devices.py) | 设备枚举与稳定标识、角色绑定 |
| [ai_service/domain.py](../ai_service/domain.py) | 数据集、轮次、设备绑定与业务错误规则 |
| [ai_service/episode_data.py](../ai_service/episode_data.py) | 示教轮次、JPEG、索引、完整性及导入导出 |
| [ai_service/fashionstar_protocol.py](../ai_service/fashionstar_protocol.py) | FashionStar 原始协议打包、校验与反馈解析 |
| [ai_service/follower_calibration.py](../ai_service/follower_calibration.py) | 从臂校准记录、范围、JSON 与归一化转换 |
| [ai_service/inference_runtime.py](../ai_service/inference_runtime.py) | 策略进程、状态读取、动作调度与推理诊断 |
| [ai_service/lerobot_convert.py](../ai_service/lerobot_convert.py) | 将示教角度、相机和统计量转换到 LeRobot 数据约定 |
| [ai_service/model_import.py](../ai_service/model_import.py) | 完整模型包验证、发行包识别与导入整理 |
| [ai_service/native_act_driver.py](../ai_service/native_act_driver.py) | 原生 FashionStar SDK 适配与从臂读写、校准坐标转换 |
| [ai_service/native_cameras.py](../ai_service/native_cameras.py) | Ubuntu V4L2 双相机枚举、模式、JPEG 流与采集 |
| [ai_service/release_adapter.py](../ai_service/release_adapter.py) | 将上游发行模型的目录和配置适配为本工作台模型 |
| [ai_service/serial_connections.py](../ai_service/serial_connections.py) | Linux 主从臂串口连接、读取、写入与状态 |
| [ai_service/store.py](../ai_service/store.py) | 业务状态的本机持久化 |
| [ai_service/synchronizer.py](../ai_service/synchronizer.py) | 关节与相机样本时间同步 |
| [ai_service/telemetry.py](../ai_service/telemetry.py) | 实时状态和 SSE 遥测发布 |
| [ai_service/teleop_runtime.py](../ai_service/teleop_runtime.py) | 主从臂示教循环、滤波与真实样本发布 |
| [ai_service/training_dataset.py](../ai_service/training_dataset.py) | 训练数据准备、完整性检查与转换缓存 |
| [ai_service/training_environment.py](../ai_service/training_environment.py) | 独立 Python 环境准备、依赖安装与加速设备自检 |
| [ai_service/training_jobs.py](../ai_service/training_jobs.py) | 训练子进程、日志、检查点、停止与恢复 |
| [ai_service/training_manifest.json](../ai_service/training_manifest.json) | Python / LeRobot / PyTorch 版本及加速源清单 |
| [ai_service/vendor/README.txt](../ai_service/vendor/README.txt) | 离线原生 SDK / 串口 wheel 来源与 SHA256 |
| [ai_service/vendor/fashionstar_uart_sdk-1.3.6-py3-none-any.whl](../ai_service/vendor/fashionstar_uart_sdk-1.3.6-py3-none-any.whl) | FashionStar 官方 UART SDK 1.3.6 离线依赖 |
| [ai_service/vendor/fashionstar_uart_sdk-1.3.6-py3-none-any.whl.LICENSE.txt](../ai_service/vendor/fashionstar_uart_sdk-1.3.6-py3-none-any.whl.LICENSE.txt) | FashionStar SDK 随附的原始许可文本 |
| [ai_service/vendor/pyserial-3.5-py2.py3-none-any.whl](../ai_service/vendor/pyserial-3.5-py2.py3-none-any.whl) | pyserial 3.5 离线串口依赖，wheel 内含许可 |
| [docs/ACT_GUIDE.md](../docs/ACT_GUIDE.md) | 采集、校准、训练、完整模型导入与执行教程 |
| [docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md) | 服务器、浏览器、本机后台与虚拟环境职责说明 |
| [docs/DEPLOYMENT.md](../docs/DEPLOYMENT.md) | 服务器只上传静态文件的发布教程 |
| [docs/DEVELOPMENT.md](../docs/DEVELOPMENT.md) | 开发检查、打包、更新与持续集成教程 |
| [docs/FILE_MAP.md](../docs/FILE_MAP.md) | 本清单：每个仓库文件的用途 |
| [docs/TROUBLESHOOTING.md](../docs/TROUBLESHOOTING.md) | 启动、环境、设备、相机与导入问题排查 |
| [docs/UBUNTU.md](../docs/UBUNTU.md) | Ubuntu 首次安装、本地启动、环境与数据目录教程 |
| [docs/WINDOWS.md](../docs/WINDOWS.md) | Windows 启动与功能支持范围教程 |
| [package-lock.json](../package-lock.json) | 固定 Node 开发依赖解析版本 |
| [package.json](../package.json) | ES module 配置、前端测试命令和 Playwright 开发依赖 |
| [runtime/Browser_SDK/index.html](../runtime/Browser_SDK/index.html) | 安装组件自带的最小状态页面，完整界面在网站 |
| [runtime/start_desktop_sessions.py](../runtime/start_desktop_sessions.py) | 安装后识别活动桌面用户并启动用户后台 |
| [runtime/ubuntu_runtime.py](../runtime/ubuntu_runtime.py) | 用户后台启动、网站授权、环回 API 与组件连接检测 |
| [start_ubuntu.sh](../start_ubuntu.sh) | Ubuntu 一步启动本机网页与后台并打开浏览器 |
| [start_windows.bat](../start_windows.bat) | Windows 自动选择 Python 启动同一网页与后台 |
| [tests/act_camera_frame_encoder_worker_client.test.js](../tests/act_camera_frame_encoder_worker_client.test.js) | 软件测试：管理相机编码 Worker 请求、超时与退出 |
| [tests/act_camera_frame_uploader.test.js](../tests/act_camera_frame_uploader.test.js) | 软件测试：管理双相机帧上传队列、批次与结束排空 |
| [tests/act_camera_state.test.js](../tests/act_camera_state.test.js) | 软件测试：统一相机连接、采集和丢帧状态 |
| [tests/act_cameras.test.js](../tests/act_cameras.test.js) | 软件测试：ACT 相机设备选择、角色绑定与预览 |
| [tests/act_capture_quality.test.js](../tests/act_capture_quality.test.js) | 软件测试：采集同步质量和帧率统计 |
| [tests/act_waveform.test.js](../tests/act_waveform.test.js) | 软件测试：Action / State 多通道曲线、时间轴与绘制 |
| [tests/act_workbench_contract.test.js](../tests/act_workbench_contract.test.js) | 软件测试：ACT 页面结构与流程约束 |
| [tests/api_client.test.js](../tests/api_client.test.js) | 软件测试：请求及响应体超时、取消与禁止自动重试 |
| [tests/browser_smoke.cjs](../tests/browser_smoke.cjs) | 自动浏览器验证、临时本机服务与安装包生成检查 |
| [tests/follower_calibration_ui.test.js](../tests/follower_calibration_ui.test.js) | 软件测试：从臂校准与重试界面 |
| [tests/model_import_ui.test.js](../tests/model_import_ui.test.js) | 软件测试：完整模型导入界面 |
| [tests/page_lifecycle.test.js](../tests/page_lifecycle.test.js) | 软件测试：停止和释放成功后切页、失败保留原页与重复点击合并 |
| [tests/piper/factory_params.test.js](../tests/piper/factory_params.test.js) | 软件测试：舵机工厂参数定义、解析与验证 |
| [tests/piper/fl_trajectory_controller.test.js](../tests/piper/fl_trajectory_controller.test.js) | 软件测试：从臂轨迹播放、暂停、停止和指令调度 |
| [tests/piper/fl_trajectory_model.test.js](../tests/piper/fl_trajectory_model.test.js) | 软件测试：从臂轨迹结构、插值与关节模型 |
| [tests/piper/fl_trajectory_preview.test.js](../tests/piper/fl_trajectory_preview.test.js) | 软件测试：从臂轨迹的 3D 预览 |
| [tests/piper/fl_trajectory_store.test.js](../tests/piper/fl_trajectory_store.test.js) | 软件测试：从臂轨迹持久化、导入与导出 |
| [tests/piper/fl_trajectory_ui_contract.test.js](../tests/piper/fl_trajectory_ui_contract.test.js) | 软件测试：轨迹编辑界面约束 |
| [tests/piper/piper_ground_pose.test.js](../tests/piper/piper_ground_pose.test.js) | 软件测试：PiPER 贴地显示姿态 |
| [tests/piper/piper_joint_direction.test.js](../tests/piper/piper_joint_direction.test.js) | 软件测试：PiPER 关节方向 |
| [tests/piper/piper_leader_contract.test.js](../tests/piper/piper_leader_contract.test.js) | 软件测试：PiPER Mate 姿态源配置与显示约束 |
| [tests/piper/piper_readback_zero.test.js](../tests/piper/piper_readback_zero.test.js) | 软件测试：PiPER 实时角度、J3 多圈与夹爪中心线 |
| [tests/piper/release_version_contract.test.js](../tests/piper/release_version_contract.test.js) | 软件测试：两系统启动脚本与整合服务入口 |
| [tests/piper/servo_setup_flow.test.js](../tests/piper/servo_setup_flow.test.js) | 软件测试：舵机 ID 和参数设置的读写校验流程 |
| [tests/piper/servo_setup_ui_contract.test.js](../tests/piper/servo_setup_ui_contract.test.js) | 软件测试：舵机设置界面与读写错误显示 |
| [tests/test_act_policy_worker.py](../tests/test_act_policy_worker.py) | 软件测试：独立进程加载 ACT 策略并产生预测动作 |
| [tests/test_action_schedule.py](../tests/test_action_schedule.py) | 软件测试：动作块队列、节拍调度与多次预测融合 |
| [tests/test_api.py](../tests/test_api.py) | 软件测试：HTTP API、数据集与轮次流程 |
| [tests/test_capabilities.py](../tests/test_capabilities.py) | 软件测试：检测 Python、训练依赖、GPU 与运行阻碍 |
| [tests/test_devices.py](../tests/test_devices.py) | 软件测试：设备枚举与稳定标识、角色绑定 |
| [tests/test_domain.py](../tests/test_domain.py) | 软件测试：数据集、轮次、设备绑定与业务错误规则 |
| [tests/test_episode_data.py](../tests/test_episode_data.py) | 软件测试：示教轮次、JPEG、索引、完整性及导入导出 |
| [tests/test_fashionstar_protocol.py](../tests/test_fashionstar_protocol.py) | 软件测试：FashionStar 原始协议打包、校验与反馈解析 |
| [tests/test_follower_calibration.py](../tests/test_follower_calibration.py) | 软件测试：从臂校准记录、范围、JSON 与归一化转换 |
| [tests/test_inference_runtime.py](../tests/test_inference_runtime.py) | 软件测试：策略进程、状态读取、动作调度与推理诊断 |
| [tests/test_lerobot_convert.py](../tests/test_lerobot_convert.py) | 软件测试：将示教角度、相机和统计量转换到 LeRobot 数据约定 |
| [tests/test_model_import.py](../tests/test_model_import.py) | 软件测试：完整模型包验证、发行包识别与导入整理 |
| [tests/test_native_act_driver.py](../tests/test_native_act_driver.py) | 软件测试：原生 FashionStar SDK 适配与从臂读写、校准坐标转换 |
| [tests/test_native_camera_api.py](../tests/test_native_camera_api.py) | 软件测试：原生相机 HTTP API |
| [tests/test_native_camera_manager.py](../tests/test_native_camera_manager.py) | 软件测试：原生双相机管理 |
| [tests/test_native_cameras.py](../tests/test_native_cameras.py) | 软件测试：Ubuntu V4L2 双相机枚举、模式、JPEG 流与采集 |
| [tests/test_native_cameras_streaming.py](../tests/test_native_cameras_streaming.py) | 软件测试：原生相机流与结束排空 |
| [tests/test_release_adapter.py](../tests/test_release_adapter.py) | 软件测试：将上游发行模型的目录和配置适配为本工作台模型 |
| [tests/test_serial_connections.py](../tests/test_serial_connections.py) | 软件测试：Linux 主从臂串口连接、读取、写入与状态 |
| [tests/test_synchronizer.py](../tests/test_synchronizer.py) | 软件测试：关节与相机样本时间同步 |
| [tests/test_telemetry.py](../tests/test_telemetry.py) | 软件测试：实时状态和 SSE 遥测发布 |
| [tests/test_teleop_runtime.py](../tests/test_teleop_runtime.py) | 软件测试：主从臂示教循环、滤波与真实样本发布 |
| [tests/test_training_dataset.py](../tests/test_training_dataset.py) | 软件测试：训练数据准备、完整性检查与转换缓存 |
| [tests/test_training_environment.py](../tests/test_training_environment.py) | 软件测试：独立 Python 环境准备、依赖安装与加速设备自检 |
| [tests/test_training_jobs.py](../tests/test_training_jobs.py) | 软件测试：训练子进程、日志、检查点、停止与恢复 |
| [tools/build_runtime_package.py](../tools/build_runtime_package.py) | 构建 Debian 模板、桌面自启动、udev 与浏览器校验值 |
| [tools/check_distribution.py](../tools/check_distribution.py) | 校验安装模板、源码一致性、换行、静态文件与资源路径 |
| [tools/check_file_map.py](../tools/check_file_map.py) | 逐文件用途清单生成与遗漏检查 |
| [tools/package_site.py](../tools/package_site.py) | 生成仅含静态网站的单个交付 ZIP 与 SHA256 清单 |
| [tools/serve_local.py](../tools/serve_local.py) | 源码启动入口，检查版本并同端口提供完整网页与 API |
