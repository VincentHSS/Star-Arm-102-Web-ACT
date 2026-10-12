# 第三方来源与许可

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
