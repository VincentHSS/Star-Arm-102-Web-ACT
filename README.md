# Star Arm 102 数字孪生平台

提供机械臂控制台、ACT 数据采集与模型执行，以及 Touch R1 → LumosTouch V3 的 Ubuntu 本地控制台。

## 下载与使用

[下载最新交付包](https://github.com/VincentHSS/Star-Arm-102-Web-ACT/releases/latest)

| 你的用途 | 下载文件 | 教程 |
| --- | --- | --- |
| 上传网站，使用完整控制台和 ACT | `Star-Arm-102-SERVER-FINAL-v1.0.35.zip` | [服务器部署](docs/DEPLOYMENT.md) |
| Ubuntu 本地控制 LumosTouch | `Star-Arm-102-Lumos-Ubuntu-v1.0.38.zip` | [Lumos 启动与操作](docs/LUMOS_TELEOP.md) |
| 使用网站上的 ACT 采集、训练或执行模型 | 打开提供方的 HTTPS 网站 | [ACT 操作](docs/ACT_GUIDE.md) |
| Windows 客户执行已转换的网页模型 | 打开网站的 `act-browser.html` | [纯网页执行](docs/BROWSER_EXECUTION.md) |

发布版本 v1.0.39 整理了教程与交付文件，服务器运行版本仍为 1.0.35，Lumos 本地运行版本仍为 1.0.38。升级此文档版本无需删除已有 SDK 环境或校准数据。

## Lumos 本地启动

适用 Ubuntu 22.04 / 24.04 x86-64、系统 Python 3.10～3.12、Chrome / Edge。首次启动需联网准备依赖。

解压 **Lumos ZIP**，在解压目录打开终端：

```bash
bash start_ubuntu_lumos.sh
```

使用终端显示的本机地址。启动器默认从 **18767** 自动选择空闲端口；需要时可指定 `--port 18800`。

如果下载的是整个仓库源码，先进入交付目录：

```bash
cd delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38
bash start_ubuntu_lumos.sh
```

连接、CAN 配置、校准保存与复用、正常退出见 [Lumos 教程](docs/LUMOS_TELEOP.md)。`.deb` 是网站本机组件，用 `sudo apt install ./文件名.deb` 安装；本地 ZIP 使用上述 Bash 启动入口。

## 服务器部署

完整解压服务器 ZIP，**只上传 `服务器网页/` 内的全部内容**，保留 `src/`、`assets/`、`downloads/` 及文件名大小写，启用 HTTPS。服务器只托管网页，设备、相机和计算环境位于客户电脑。

网站模型使用压缩资源、校验、缓存与失败回退。更新时完整覆盖 HTML、JS 和资源，清理旧缓存；部署要求见 [服务器教程](docs/DEPLOYMENT.md)。

## 教程

- [快速上手与下载选择](docs/GETTING_STARTED.md)
- [Lumos 本地运行、CAN、连接与校准](docs/LUMOS_TELEOP.md)
- [完整控制台](docs/CONSOLE_GUIDE.md)
- [ACT 采集、训练、导入与执行](docs/ACT_GUIDE.md)
- [Ubuntu 安装与完整平台源码启动](docs/UBUNTU.md)
- [Windows 使用方式](docs/WINDOWS.md)
- [常见问题](docs/TROUBLESHOOTING.md)

## 仓库目录

| 目录 | 用途 |
| --- | --- |
| `delivery/` | 当前两份完整交付的源码和资源，客户使用此目录或 Release ZIP |
| `Browser_SDK/`、`ai_service/`、`runtime/` | 原完整平台开发工程，供维护与集成使用 |
| `docs/` | 客户教程与维护说明 |
| `tools/`、`tests/` | 打包、文件校验及软件测试 |

[交付目录说明](delivery/README.md) · [运行架构](docs/ARCHITECTURE.md) · [开发与打包](docs/DEVELOPMENT.md) · [逐文件用途](docs/FILE_MAP.md) · [第三方来源与许可](THIRD_PARTY.md)

根目录启动脚本用于原开发工程；客户 Lumos 版使用 `delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/` 中的入口。两者的服务端口和界面不能混用。
