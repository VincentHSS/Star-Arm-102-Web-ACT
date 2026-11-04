# 当前交付文件

当前服务器网页为 **srv1.0.37**，内置 Ubuntu ACT 组件 1.0.25，按检查点配置执行 ACT 动作，并按采集时间戳对齐训练数据。

服务器部署使用下方目录或 [纯服务器部署 ZIP](https://github.com/servodevelop/star-arm-studio/archive/refs/heads/main.zip)。独立 Lumos 包可从 [GitHub Releases](https://github.com/VincentHSS/Star-Arm-102-Web-ACT/releases) 下载。

| 目录 | 用途 | 教程 |
| --- | --- | --- |
| [Star-Arm-102-SERVER-FINAL-v1.0.37](Star-Arm-102-SERVER-FINAL-v1.0.37/) | 上传服务器的完整静态网站 | [部署教程](../docs/DEPLOYMENT.md) |
| [Star-Arm-102-Lumos-Ubuntu-v1.0.38](Star-Arm-102-Lumos-Ubuntu-v1.0.38/) | Ubuntu 本地 Lumos 控制台 | [Lumos 教程](../docs/LUMOS_TELEOP.md) |

Lumos ZIP 解压后，在包目录运行 `bash start_ubuntu_lumos.sh`。服务器 ZIP 只上传 `服务器网页/` 内的全部内容。

源码完整性检查：`python tools/check_latest_delivery.py`。重新打包：`python tools/package_latest_delivery.py`，输出到 `dist/latest-delivery/`。

`manifest.json` 记录当前交付 ZIP 和各文件的 SHA256。各 GitHub Release 附件使用发布时的校验值。
