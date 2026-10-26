# 快速上手

## 先选择使用方式

到 [最新发布](https://github.com/VincentHSS/Star-Arm-102-Web-ACT/releases/latest) 下载对应文件：

| 目的 | 入口 | 下一步 |
| --- | --- | --- |
| Ubuntu 本地用 Touch R1 控制 LumosTouch | `Star-Arm-102-Lumos-Ubuntu-v1.0.38.zip` | [Lumos 教程](LUMOS_TELEOP.md) |
| 将完整网站部署到服务器 | `Star-Arm-102-SERVER-FINAL-v1.0.35.zip` | [部署教程](DEPLOYMENT.md) |
| 使用已经部署的网站做 ACT | 提供方 HTTPS 网站 | [ACT 教程](ACT_GUIDE.md) |
| Windows 纯网页执行已转换模型 | 网站的 `act-browser.html` | [网页执行教程](BROWSER_EXECUTION.md) |
| 开发或维护完整平台 | GitHub Code → Download ZIP | [Ubuntu](UBUNTU.md) / [Windows](WINDOWS.md) |

## Lumos 本地控制

1. 解压 Lumos ZIP，在解压目录运行 `bash start_ubuntu_lumos.sh`。
2. 首次等待依赖准备完成，打开终端显示的本地地址。
3. 停止控制并断开设备后，用 `sudo bash configure_can.sh can0` 配置实际 CAN 接口为 1 Mbps。
4. 连接 Touch R1，检查 LumosTouch 与夹爪配置，确认后连接从臂。
5. 完成校准或检查并复用已保存校准，核对目标预览后开始。
6. 结束时先停止、断开设备，再在启动终端按 Ctrl+C。

该版本只有 Lumos 遥操作，不包含 ACT、相机采集和其他机械臂的配置页面。具体按钮、波特率和校准步骤见 [Lumos 教程](LUMOS_TELEOP.md)。

## 完整网站控制台

![完整平台控制台，未连接硬件](images/console-overview.png)

左侧连接设备，中间查看模型与目标预览，右侧查看关节及相应控制。模型显示成功不等于设备已经连接，设备状态以真实反馈为准。[完整控制台教程](CONSOLE_GUIDE.md) 适用于服务器版及原完整平台开发工程。

本文截图来自完整平台的未连接状态，不是 Lumos 专用客户版的新布局截图。

## ACT 操作顺序

| 步骤 | 用途 |
| --- | --- |
| 1 数据采集 | 在当前设备电脑安装采集组件、连接主从臂与双相机、创建并记录数据集 |
| 2 训练任务 | 需要训练时准备独立 LeRobot / PyTorch 环境，再选择数据集训练 |
| 3 模型管理 | 导入已有完整模型，或选择训练结果并导出 |
| 4 实机推理 | 在该页连接从臂和对应双相机，完成校验后执行 |

只执行已有完整模型时，无需重新采集或训练。Windows 纯网页方式需要提供方导出的网页模型包；原生执行方式按 [ACT 教程](ACT_GUIDE.md) 准备本机环境。

ACT 页面切换会按流程停止控制并释放串口；进入执行页后在该页连接从臂。训练在 Ubuntu 上进行，网站服务器无需连接机械臂或安装 GPU 环境。

遇到问题见 [常见问题](TROUBLESHOOTING.md)。
