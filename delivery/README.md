# 当前交付文件

到 [最新发布](https://github.com/VincentHSS/Star-Arm-102-Web-ACT/releases/latest) 下载完整 ZIP。

| 目录 | 用途 | 教程 |
| --- | --- | --- |
| [Star-Arm-102-SERVER-FINAL-v1.0.35](Star-Arm-102-SERVER-FINAL-v1.0.35/) | 上传服务器的完整静态网站 | [部署教程](../docs/DEPLOYMENT.md) |
| [Star-Arm-102-Lumos-Ubuntu-v1.0.38](Star-Arm-102-Lumos-Ubuntu-v1.0.38/) | Ubuntu 本地 Lumos 控制台 | [Lumos 教程](../docs/LUMOS_TELEOP.md) |

运行版本保持不变；v1.0.39 仅更新教程、整理说明和删除冗余交付文件。根目录原开发工程不作为这两份 ZIP 的替代入口。

Lumos ZIP 解压后，在包目录运行 `bash start_ubuntu_lumos.sh`。服务器 ZIP 只上传 `服务器网页/` 内的全部内容。

源码完整性检查：`python tools/check_latest_delivery.py`。重新打包：`python tools/package_latest_delivery.py`，输出到 `dist/latest-delivery/`。

`manifest.json` 记录当前交付 ZIP 和各文件的 SHA256。历史发布中的文件保持原样，当前版本校验值以当前 Release 为准。
