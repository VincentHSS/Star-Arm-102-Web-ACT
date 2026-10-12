# Windows · 下载、启动与支持范围

Windows 可运行 Star Arm 102 控制台、Web Serial 控制、界面预览，以及数据集和模型管理。**当前完整 ACT 训练、Ubuntu 原生双相机和实机执行要求 Ubuntu**；不要把 Windows 启动成功理解成原生 ACT 硬件功能也全部可用。

## 1. 安装 Python

1. 从 [Python 官方 Windows 发布页](https://www.python.org/downloads/windows/) 选择 Python 3.10～3.12 系列的可安装版本，本项目不使用更新主版本。
2. 运行安装器，勾选 **Add Python to PATH**，保留 Python 启动器选项，按安装器流程完成安装。
3. 安装后重新打开启动窗口，使新 PATH 生效。官方安装选项说明见 [Python 3.12 Windows 文档](https://docs.python.org/3.12/using/windows.html)。

普通客户不需要安装 Node.js、npm 或 Docker。

## 2. 下载源码，找到启动脚本

1. 打开 [GitHub 仓库](https://github.com/VincentHSS/Star-Arm-102-Web-ACT)，点击 **Code → Download ZIP**。
2. 在文件管理器解压源码 ZIP，进入真正的源码根目录。Windows 隐藏扩展名时，可在“查看”中开启“文件扩展名”。
3. 确认目录内有 `start_windows.bat`、`Browser_SDK/` 和 `tools/`。
4. 双击 **start_windows.bat**。脚本先找 Python 启动器，再找 Python；失败时会保留错误窗口。

不要在压缩包预览窗口内直接运行，也不要下载 Release 的服务器静态包来找启动脚本。

## 3. 打开并使用控制台

正常启动会自动打开 `http://127.0.0.1:18765/`；没有自动打开时，在 Chrome / Edge 输入该地址。保持启动窗口打开，关闭它会结束源码后台。

![Windows 使用的同一控制台界面；截图为未连接状态](images/console-overview.png)

按 [控制台图文教程](CONSOLE_GUIDE.md) 选择硬件和连接串口。浏览器弹出的设备选择框需用户选择端口；端口不存在时检查 USB 驱动、设备供电及其他程序是否占用。

## 4. 哪些功能可以使用

| 功能 | Windows 当前支持情况 |
| --- | --- |
| 控制台三维查看、目标预览 | 支持 |
| 支持型号的浏览器串口控制 | 支持，取决于当前设备与串口驱动 |
| ACT 页面预览、数据集和模型管理 | 支持对应管理接口；不代表 Linux 硬件执行可用 |
| 完整原生 ACT 训练与实机推理 | 使用 Ubuntu |
| Ubuntu V4L2 原生双相机 | 使用 Ubuntu |
| 网页下载的 `.deb` 组件 | 仅用于 Ubuntu，不能在 Windows 安装 |

## 5. 退出和常见问题

先停止正在进行的控制或文件操作，再关闭启动窗口。页面切换会释放串口，进入目标页面后需重新连接。

| 现象 | 处理 |
| --- | --- |
| 提示没有 Python | 安装项目支持的版本并启用 PATH，重开窗口 |
| 双击闪退或看到路径错误 | 确认已完整解压，从根目录运行，不要只复制 `.bat` |
| 本机地址无法访问 | 检查启动窗口错误、端口冲突，以及代理是否拦截本机请求 |
| 18765 被占用 | 只保留一个后台实例；不要启动多个源码窗口 |
| ACT 提示 Ubuntu 功能未准备 | 完整实机流程换到 Ubuntu，不能通过 Windows 安装 `.deb` 解决 |

下一步：[控制台教程](CONSOLE_GUIDE.md) · [Ubuntu 完整 ACT 流程](UBUNTU.md) · [常见问题](TROUBLESHOOTING.md)
