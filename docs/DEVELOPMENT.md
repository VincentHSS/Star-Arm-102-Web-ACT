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

该检查会临时启动本机后台，不连接机械臂、不安装 GPU 训练依赖，验证页面加载、API、自动环境准备界面、模型管理、安装包生成、移动屏幕与两页切换。若电脑已有组件占用 18765，请先停止旧实例。

修改 `ai_service/`、`runtime/` 或安装组件内容后，运行 `build_runtime_package.py`。它重建网站内的 `.deb` 模板并更新浏览器模板校验值；不能只更新其中一份。修改文件结构后使用 `python tools/check_file_map.py --write` 重建逐文件说明，再检查。

`package_site.py` 只生成一个服务器网站 ZIP 到 `dist/`。不打入后台源码、临时日志、测试、模型、校准、示教数据或开发依赖。客户运行源码时从 GitHub 下载源码 ZIP，服务器发布使用 Release 的网站 ZIP。

GitHub Actions 自动运行 JavaScript / Python 软件检查、安装包结构和文件说明检查。软件测试验证协议、队列、校准、数据集、模型导入及界面约束；它们不能替代 Ubuntu 系统安装、相机、串口、GPU 或机械臂实机验收。
