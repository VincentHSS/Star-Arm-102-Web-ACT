# 第三方来源与许可

新增 URDF 预览资源：`assets/urdf/fl-v3/` 来自用户提供的 `URDF.zip`（LumosTouch / FastTouchV3.SLDASM）；`assets/urdf/ld-touch/` 来自 [Touch R1 Leader Arm](https://github.com/servodevelop/touch-r1-leader-arm/tree/2b07a1a74b7b0ae5a6a4915ccd58a055cfde4597/hardware/robot-description) 的 URDF 包。保留原始 `source.urdf`；`model.urdf` 仅将网格引用改为相对路径。网格未修改；LD 全部 21 份视觉网格按原连杆归属加载。上游 LD 的 continuous 关节用于预览，不作为实机无限旋转或编码器零点的依据。相关资产沿用各自来源授权，本工程不另行授予模型资产许可。

本平台基于 Star Arm 102 浏览器控制台与 ACT 工程。原工程参考：<https://github.com/servodevelop/Star-Arm-102>。本仓库未为全部原始资产擅自添加新的统一开源许可证；公开可下载并不等于所有品牌和模型资产都被重新授权。

| 组件 | 位置与说明 |
| --- | --- |
| Three.js、OrbitControls、STLLoader | `Browser_SDK/assets/vendor/`，保留文件内的 MIT 许可头。 |
| FashionStar UART SDK 1.3.6 | `ai_service/vendor/fashionstar_uart_sdk-1.3.6-py3-none-any.whl`，未修改的上游 wheel；随附 `.LICENSE.txt` 保留原 MIT 文本。 |
| pyserial 3.5 | `ai_service/vendor/pyserial-3.5-py2.py3-none-any.whl`，未修改的上游 wheel；许可证在 wheel 的 dist-info/LICENSE.txt。 |
| LeRobot 与 PyTorch | 按训练清单在用户本机安装，上游组件适用各自的许可证；不随本仓库打包训练环境。 |
| Playwright | 仅开发浏览器检查依赖，依赖包保留自身 Apache-2.0 许可证。 |
| STL、URDF 与品牌图像 | 保留原工程的模型和显示资产，需按各自原始授权使用；部分非执行模型资源用于兼容原有显示配置，不代表恢复了达妙驱动。 |

wheel 校验值见 `ai_service/vendor/README.txt`。安装组件中同样保留相关许可和来源信息。

Windows 相机通道使用 DirectShow，由客户运行环境中的 imageio-ffmpeg 提供 FFmpeg 可执行程序；该程序通过上游 Python 包安装，不随静态网站复制分发。imageio-ffmpeg 包与其 FFmpeg 二进制各自的上游许可适用，见安装环境的包许可及 [上游项目](https://github.com/imageio/imageio-ffmpeg)。

纯网页 ACT 使用自托管 ONNX Runtime Web 1.30.0（MIT）和 fflate（MIT），位于 `Browser_SDK/assets/vendor/onnxruntime-web/` 与 `fflate/`，分别保留 `LICENSE.txt` 和原 npm 包的版本、SHA-512 完整性信息。文件来自 npm 官方包并校验完整性；ONNX Runtime 模块仅将 `.mjs` 文件名/引用改为 `.js` 以适配普通静态服务器，计算实现未改。原始模型权重、训练数据和客户校准不随网站仓库发布。
