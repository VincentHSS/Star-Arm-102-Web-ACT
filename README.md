# Star Arm 102 数字孪生平台

平台集成 Star Arm 102 控制台和 ACT 的采集、训练、模型导入、执行流程。保留 PiPER Mate 的关节方向、夹爪、原点和串口修复；控制台与 ACT 之间有全屏动态切换，至少显示约 5 秒。

**完整 ACT 实机流程使用 Ubuntu。** 网站可以放在服务器上，机械臂、相机、数据和 GPU 仍在客户电脑上。服务器不连接机械臂，也不执行训练。

## 我应该下载哪个？

- **上传网站的运营者：** 到 [Releases](https://github.com/VincentHSS/Star-Arm-102-Web-ACT/releases/latest) 下载唯一的 `Star-Arm-102-SERVER-UPLOAD-ONLY.zip`。将其中 `服务器网页` 文件夹里的内容上传到网站目录，启用 HTTPS。无需填写发布配置或网站地址。
- **在电脑上运行源码：** 点击 GitHub 的 **Code → Download ZIP**，解压后按下面的 Ubuntu 或 Windows 步骤启动。它包含网站、后台和两种启动脚本。
- **通过服务器网站使用 ACT 的客户：** 打开网页进入第 2 步。首次需要安装网页提供的 Ubuntu 运行组件；之后网页检测连接并准备 ACT 环境。客户不需要下载源码、填写后台地址或输入训练命令。

## Ubuntu 本地启动

适用于 Ubuntu 22.04 / 24.04，Python 3.10～3.12，Chrome / Edge。

```sh
sudo apt update
sudo apt install -y python3 python3-venv python3-dev python3-tk build-essential v4l-utils ffmpeg libgl1 libglib2.0-0
cd Star-Arm-102-Web-ACT
sh start_ubuntu.sh
```

脚本会打开 `http://127.0.0.1:18765/`。进入 ACT，第 2 步会自动准备独立的 LeRobot / PyTorch 环境；采集、校准、训练和模型执行都通过网页操作。上述系统依赖只需在源码方式首次启动时准备。

详见 [Ubuntu 教程](docs/UBUNTU.md)、[ACT 操作教程](docs/ACT_GUIDE.md)。

## Windows 本地启动

安装 Python 3.10～3.12，安装时勾选 **Add Python to PATH**。解压源码后双击根目录的 **`start_windows.bat`**，浏览器会自动打开控制台。

Windows 支持控制台 Web Serial、界面预览以及数据集和模型管理。**当前完整 ACT 训练、Linux 原生双相机和实机执行需要 Ubuntu**；Windows 脚本不会将这些 Linux 功能变成 Windows 驱动。详见 [Windows 教程](docs/WINDOWS.md)。

## 服务器发布与文件说明

- [服务器上传教程](docs/DEPLOYMENT.md)：上传哪些文件、HTTPS、客户首次安装流程。
- [每个文件的用途](docs/FILE_MAP.md)：逐文件列出前端、后台、资源、运行组件、测试与脚本。
- [运行架构](docs/ARCHITECTURE.md)：浏览器、电脑后台与独立 ACT 环境的关系。
- [常见问题](docs/TROUBLESHOOTING.md)：启动错误、组件未连接、串口和相机问题。
- [开发与检查](docs/DEVELOPMENT.md)：软件验证、打包与持续集成。
- [第三方组件](THIRD_PARTY.md)：来源与许可位置。

仓库不包含客户的模型权重、示教数据、校准文件、账号密钥或训练环境。3D STL / URDF 是页面显示所需资源，不能当作多余文件删除。

本版提供软件检查和浏览器验证；Ubuntu 安装器的系统安装、登录自启动及机械臂实机效果仍需在目标 Ubuntu 电脑验收。
