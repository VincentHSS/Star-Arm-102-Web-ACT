# 第三方来源与许可

URDF 资源：`Browser_SDK/assets/urdf/fl-v3/` 来自用户提供的 `URDF.zip`（LumosTouch / FastTouchV3.SLDASM）；`Browser_SDK/assets/urdf/ld-touch/` 来自 [Touch R1 Leader Arm 固定提交 7c681191](https://github.com/servodevelop/touch-r1-leader-arm/tree/7c6811913e0928b04a2ad69d6ab25b7f22217ee5/hardware/robot-description) 的 URDF 包。保留原始 `source.urdf`、`upstream-README.md` 与 `kinematics.json`。上游 21 份视觉网格（182,708 个三角面）按原连杆归属加载，下载文件与该提交一致。额外的 `link_6-gripper-servo.stl` 从本工程原有 `Browser_SDK/assets/models/ld/link6.STL` 提取独立夹爪电机实体，按 Touch R1 新支架的安装孔及槽配准；未复制旧握柄结构。`model.urdf` 使用相对路径并加入这份固定视觉模型。提取及定位依据见 `gripper-servo.json`，各文件 SHA-256 见 `SOURCE.json`；上游原文与本地补充明确区分。当前源装配移除了 A000、B000 两个限位块。上游 continuous 关节只表示可视化旋转，显示装配配准不是实机标定；实机 ID、方向、零位和限位需由控制标定单独确定。相关资产沿用各自来源授权，本工程不另行授予模型资产许可。

LumosTouch 遥操作参考用户指定的 [VincentHSS/stararm102-lumos-teleop 固定提交 c9922364](https://github.com/VincentHSS/stararm102-lumos-teleop/tree/c9922364c22156bba277ff1ba904f5d0ac696079)，采用六轴参考姿态映射、自适应滤波、按实际时间限速及单帧变化限制，以及 ID 6 夹爪的闭合/张开端点映射。网页会话、型号配对、校准流程与超时停止由本工程实现。Lumos 本机 SDK 通过 [lumos-open/startouch_sdk 固定提交 04041254](https://github.com/lumos-open/startouch_sdk/tree/040412542c0b6b6fd2bb6dd652c0de6c666631be) 在用户 Ubuntu 独立环境中安装，源码下载校验值记录于 `tools/start_lumos_local.py`；其本机库和依赖不复制到静态网站，适用上游各自授权。当前 SDK 以 Ubuntu SocketCAN 为接口；模型的 URDF 更新不代表硬件兼容性或控制参数已实机确认。

本平台基于 Star Arm 102 浏览器控制台与 ACT 工程。原工程参考：<https://github.com/servodevelop/Star-Arm-102>。本仓库未为全部原始资产擅自添加新的统一开源许可证；公开可下载并不等于所有品牌和模型资产都被重新授权。

| 组件 | 位置与说明 |
| --- | --- |
| Three.js、OrbitControls、STLLoader | `Browser_SDK/assets/vendor/`，保留文件内的 MIT 许可头。 |
| Lucide 0.468.0 | 舵机配置页使用自托管 SVG 图标，来自 [固定版本官方图标](https://github.com/lucide-icons/lucide/tree/0.468.0/icons)，保留 `Browser_SDK/assets/vendor/lucide-LICENSE.txt` 中的 ISC 许可与版权声明。 |
| FashionStar UART SDK 1.3.6 | `ai_service/vendor/fashionstar_uart_sdk-1.3.6-py3-none-any.whl`，未修改的上游 wheel；随附 `.LICENSE.txt` 保留原 MIT 文本。 |
| pyserial 3.5 | `ai_service/vendor/pyserial-3.5-py2.py3-none-any.whl`，未修改的上游 wheel；许可证在 wheel 的 dist-info/LICENSE.txt。 |
| LeRobot 与 PyTorch | 按训练清单在用户本机安装，上游组件适用各自的许可证；不随本仓库打包训练环境。 |
| Playwright | 仅开发浏览器检查依赖，依赖包保留自身 Apache-2.0 许可证。 |
| STL、URDF 与品牌图像 | 保留原工程的模型和显示资产，需按各自原始授权使用；部分非执行模型资源用于兼容原有显示配置，不代表恢复了达妙驱动。 |

wheel 校验值见 `ai_service/vendor/README.txt`。安装组件中同样保留相关许可和来源信息。

Windows 相机通道使用 DirectShow，由客户运行环境中的 imageio-ffmpeg 提供 FFmpeg 可执行程序；该程序通过上游 Python 包安装，不随静态网站复制分发。imageio-ffmpeg 包与其 FFmpeg 二进制各自的上游许可适用，见安装环境的包许可及 [上游项目](https://github.com/imageio/imageio-ffmpeg)。

纯网页 ACT 使用自托管 ONNX Runtime Web 1.30.0（MIT）和 fflate（MIT），位于 `Browser_SDK/assets/vendor/onnxruntime-web/` 与 `fflate/`，分别保留 `LICENSE.txt` 和原 npm 包的版本、SHA-512 完整性信息。文件来自 npm 官方包并校验完整性；ONNX Runtime 模块仅将 `.mjs` 文件名/引用改为 `.js` 以适配普通静态服务器，计算实现未改。原始模型权重、训练数据和客户校准不随网站仓库发布。
