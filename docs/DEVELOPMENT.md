# 开发、检查与打包

普通客户无需安装 Node.js。开发检查使用 Python 3.10～3.12 和 Node.js 22 或更新版本。

```sh
npm ci
npm test
python -X utf8 -m unittest discover -s tests -p 'test_*.py'
python tools/build_runtime_package.py
python tools/check_distribution.py
python tools/check_file_map.py
python tools/package_site.py
```

在代理环境中请让 `localhost` / `127.0.0.1` 的测试请求绕过代理。Windows PowerShell 可设置 `$env:NO_PROXY='localhost,127.0.0.1,::1'`，以免系统代理代替本机后台返回错误。

浏览器检查：

```sh
npx playwright install chromium
npm run test:browser
```

该检查会临时启动本机后台，不连接机械臂、不安装 GPU 训练依赖，验证页面加载、API、自动环境准备界面、模型管理、安装包生成、移动屏幕与两页切换。整套检查需独占 18765，应在没有连接硬件的独立测试环境运行。

仅检查相机步骤切换时，可运行 `node tests/camera_navigation_smoke.cjs`。它使用随机回环端口与模拟视频流，并阻断客户服务 18765；覆盖浏览器与原生预览在 1↔4↔3 多次切换时保留连接、过期状态不能关闭新相机，以及浏览器预览不能自行满足真实执行门槛。不会连接物理相机或串口。

仅检查控制台串口连接时，运行 `node tests/console_serial_smoke.cjs`。使用随机端口的静态服务和模拟 Web Serial，验证 LD、HD、FL、即时/乱序回包、仅补读缺失 ID、失败关闭串口和重新连接。阻断客户 18765，未接触物理机械臂。`servo_readback.test.js` 以模拟时钟验证多个缺失 ID 共用每轮超时，避免依赖机器速度的计时断言。

修改 `ai_service/`、`runtime/` 或安装组件内容后，运行 `build_runtime_package.py`。它重建网站内的 `.deb` 模板并更新浏览器模板校验值；不能只更新其中一份。修改文件结构后使用 `python tools/check_file_map.py --write` 重建逐文件说明，再检查。

`package_site.py` 为根目录开发工程生成静态 ZIP 到 `dist/`：静态资源在 `服务器网页`，图文教程与截图在 `使用教程`。教程不参与网站加载。不打入后台源码、临时日志、测试、模型、校准、示教数据或开发依赖。客户运行源码时从 GitHub 下载源码 ZIP，服务器发布使用 Release 的网站 ZIP。

## 更新教程截图

安装 Playwright 与 Chromium 后，在仓库根目录运行：

```sh
node tools/capture_docs.cjs
```

工具启动临时静态服务，阻断 `127.0.0.1:18765` 的本机 API 请求，仅拍摄实际网页的未连接状态。不会连接设备、录制数据或启动训练；表单示例只填写不提交。截图输出到 `docs/images/`，完成后关闭临时浏览器与服务。若本机使用已有 Edge，可设置 `PLAYWRIGHT_BROWSER_CHANNEL=msedge`；Python 命令不是 `python` 时可设置 `PYTHON=python3`。

截图更新后逐张检查文字与布局，并核对教程按钮名称与真实界面一致。不要把未连接截图写成已完成训练或实机执行的证据。

GitHub Actions 自动运行 JavaScript / Python 软件检查、安装包结构和文件说明检查。软件测试验证协议、队列、校准、数据集、模型导入及界面约束；它们不能替代 Ubuntu 系统安装、相机、串口、GPU 或机械臂实机验收。

## 最新交付版本

`delivery/` 是当前客户交付的源码与资源；根目录保留原完整平台开发工程。仅校验或重新压缩未改动的交付内容时运行：

```bash
python tools/check_latest_delivery.py
python tools/package_latest_delivery.py
```

输出位于 `dist/latest-delivery/`。交付清单记录每个文件和当前 ZIP 的 SHA256。文档或交付文件变更后，先运行 `python tools/refresh_latest_delivery.py --release v1.0.39` 更新文件校验和清单，再核验并打包。之后发布版本时替换为相应标签；不要把旧清单留在新包中。

`tools/package_site.py` 构建的是根目录开发工程的静态包，保留原开发产物名称，不能用它覆盖最新交付包。模型原始 STL、压缩资源、运行组件及第三方许可都是实际依赖。

当前清理仅修改说明、交付清单与不使用的重复文件，保留客户已运行版本的控制、校准、启动和 SDK 准备代码。软件检查不能代替目标系统、浏览器布局和实体设备验收。
