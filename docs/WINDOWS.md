# Windows 使用教程

1. 安装 Python 3.10～3.12，勾选 **Add Python to PATH**。
2. 从 GitHub 的 **Code → Download ZIP** 下载源码，解压到普通目录。
3. 双击根目录的 `start_windows.bat`。
4. 使用 Chrome / Edge 打开自动弹出的 `http://127.0.0.1:18765/`。

脚本优先使用 Windows 的 `py` 启动器，找不到时使用 `python`。首次启动无需安装 Node.js；Node.js 仅用于开发者运行前端测试。

| 功能 | Windows 当前范围 |
| --- | --- |
| 控制台、3D 预览、界面切换 | 支持 |
| 控制台浏览器串口与 PiPER Mate | 通过 Chrome / Edge 的 Web Serial 连接，实际能力受 USB 驱动与设备影响 |
| 数据集与模型文件管理 | 支持本机后台接口；需完整模型配置 |
| 完整 ACT 训练、原生从臂驱动、Ubuntu 双相机 | 使用 Ubuntu，本版不提供完整 Windows 实机链路 |

不要在 Windows 安装 `.deb`；它只用于 Ubuntu。运行时请保留启动窗口。关闭窗口会结束本地服务。

默认状态目录是当前用户目录中的 `.local/share/star-arm-act/`，数据与模型不会写回网站源码。端口被占用时请先结束旧的 Star Arm 后台，或继续使用已运行的实例。

如果窗口报告 Python 版本不匹配，安装 3.10～3.12，确认 `py -3` 所选版本，或使用对应版本执行 `python tools/serve_local.py`。错误窗口会保留，便于查看原因。
