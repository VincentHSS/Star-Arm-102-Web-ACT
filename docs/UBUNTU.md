# Ubuntu 使用教程

## 使用服务器上的网页

1. 在连接机械臂的 Ubuntu 22.04 / 24.04 电脑上打开 Chrome / Edge，访问提供方的 HTTPS 网站。
2. 从控制台进入 ACT，打开第 2 步。第一次点击页面里的“下载 Ubuntu 组件”。网页会自动把当前网站地址写入安装包，无需手填。
3. 下载 `.deb` 后用 Ubuntu 的软件安装程序打开，点击“安装”并按系统要求授权。这是操作系统安装本机软件的授权，普通网页无法代替用户确认。
4. 安装后回到原网页。组件会尝试在当前桌面用户下启动，之后登录桌面也会自动启动。网页检测到连接后自动继续准备隔离训练环境。
5. 环境就绪后按 [ACT 操作教程](ACT_GUIDE.md) 使用。首次下载 PyTorch / LeRobot 可能较久，可在网页查看进度和错误。

仅下载 `.deb` 不等于已安装。组件无需客户打开另一个控制窗口、配置地址或反复点击启动。网页请求访问本机网络或设备时，按浏览器提示允许。

## 使用本地源码

从 GitHub **Code → Download ZIP** 下载源码并解压。源码方式不用安装网页提供的组件，两者都使用本机 `18765` 端口，选择其中一种运行方式即可。

```sh
sudo apt update
sudo apt install -y python3 python3-venv python3-dev python3-tk build-essential v4l-utils ffmpeg libgl1 libglib2.0-0
cd Star-Arm-102-Web-ACT
sh start_ubuntu.sh
```

脚本会打开网页。如果只想启动服务而不打开浏览器：

```sh
sh start_ubuntu.sh --no-browser
```

终端窗口是本地服务，关闭它会结束源码方式的后台。停止前先在网页结束记录、训练或推理。当前运行脚本是 LF 换行，可直接用 `sh` 启动，避免双击脚本时被文本编辑器打开。

## 环境、设备和数据

- 使用 Python 3.10～3.12；原生 UART 与 V4L2 都在客户 Ubuntu 上运行。
- 训练环境由第 2 步创建为 Python 虚拟环境，**不是 Docker**。当前依赖清单在 `ai_service/training_manifest.json`，LeRobot 为 `0.4.4`。
- NVIDIA CUDA、AMD ROCm、Intel XPU 的可用性由本机驱动和环境检查决定；页面以实际自检结果为准。系统显卡驱动需要电脑预先具备。
- 默认配置与数据在 `~/.local/share/star-arm-act/`（设置了 `XDG_DATA_HOME` 时跟随该位置）；页面可以更改数据目录。源码也支持 `--state-dir /你的目录`。
- 串口权限不足时，组件安装的 udev 规则会向当前活动桌面用户授予访问权限；源码方式可由管理员设置 `dialout` 权限并重新登录，再插拔设备。
- 两路相机角色按模型定义保持一致：`wrist` 为末端，`world` 为俯视。校准 JSON 必须属于当前从臂。

软件包安装、桌面自动启动和机械臂驱动需在真实 Ubuntu 桌面验收；本仓库的软件测试不会代替实机测试。
