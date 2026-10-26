# 最新完整交付

此目录保存已交付版本的完整源码和资源，与 Release 的两份 ZIP 对应。根目录保留原开发工程，客户使用下面的交付入口。

| 用途 | 版本 | 目录 |
| --- | --- | --- |
| 上传服务器，包含控制台、ACT 和网页执行 | 1.0.35 | [完整服务器包](Star-Arm-102-SERVER-FINAL-v1.0.35/) |
| Ubuntu 本地 Touch R1 → LumosTouch V3 控制 | 1.0.38 | [Lumos 客户交付版](Star-Arm-102-Lumos-Ubuntu-v1.0.38/) |

## 下载与运行

直接使用请到 [v1.0.38 Release](https://github.com/VincentHSS/Star-Arm-102-Web-ACT/releases/tag/v1.0.38) 下载 ZIP。

Lumos 本地包：

```bash
cd delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38
bash start_ubuntu_lumos.sh
```

适用 Ubuntu 22.04 / 24.04 x86-64、Python 3.10～3.12，首次联网准备依赖。默认从 18767 自动选择空闲端口；按终端显示地址打开。CAN 配置和连接顺序见包内使用说明。

服务器版：仅上传 `Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/` 中的全部内容，保留目录与文件名大小写，使用 HTTPS。`Ubuntu安装包/` 中的 `.deb` 使用 Ubuntu 包管理器安装：

```bash
sudo apt install ./star-arm-lumos_1.0.32_fashionstar_amd64.deb
```

两份交付包分别保持各自的运行入口和依赖，不混用后台。Lumos 交付版保留已运行版本的控制、校准、SDK 准备和启动流程，只整理客户界面与说明。

## 核验与重新打包

```bash
python tools/check_latest_delivery.py
python tools/package_latest_delivery.py
```

输出在 `dist/latest-delivery/`。`manifest.json` 记录每份源文件及原交付 ZIP 的 SHA256。重新压缩产生的 ZIP 元数据可以不同，解压内容按源文件哈希核验。

本机验证包括 30 项 Lumos 回归/静态检查、34 份本地模型的 HTTP 加载和解析。v1.0.38 尚未完成浏览器截图验收；实体机械臂行为需在目标设备验收。
