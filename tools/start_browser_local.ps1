param([switch]$NoBrowser, [int]$Port = 18766, [string]$WebRoot = '')
$ErrorActionPreference = 'Stop'
if (!$WebRoot) { $WebRoot = Join-Path $PSScriptRoot '..\Browser_SDK' }
$WebRoot = (Resolve-Path -LiteralPath $WebRoot).Path
if (!(Test-Path -LiteralPath (Join-Path $WebRoot 'act-browser.html'))) { throw 'Missing act-browser.html. Extract the complete ZIP before starting.' }

# Windows supplies PowerShell and .NET. This listener serves files only;
# it never loads a model, opens a camera or serial port, or starts the ACT API.
Add-Type -TypeDefinition @'
using System;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Threading;
public sealed class StarArmBrowserFiles {
    private TcpListener listener;
    private string root;
    private int port;
    private volatile bool stopped;
    public int Start(string directory, int preferredPort) {
        root = Path.GetFullPath(directory).TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar;
        for (int attempt = 0; attempt < 21; attempt++) {
            listener = new TcpListener(IPAddress.Loopback, preferredPort == 0 ? 0 : preferredPort + attempt);
            try { listener.Start(); break; }
            catch (SocketException) { if (attempt == 20) throw; }
        }
        port = ((IPEndPoint)listener.LocalEndpoint).Port;
        var thread = new Thread(Accept); thread.IsBackground = true; thread.Start();
        return port;
    }
    public void Stop() { stopped = true; if (listener != null) listener.Stop(); }
    private void Accept() {
        while (!stopped) {
            try { var client = listener.AcceptTcpClient(); ThreadPool.QueueUserWorkItem(delegate { Serve(client); }); }
            catch (SocketException) { if (stopped) return; }
            catch (ObjectDisposedException) { return; }
        }
    }
    private static string Mime(string path) {
        switch (Path.GetExtension(path).ToLowerInvariant()) {
            case ".html": return "text/html; charset=utf-8";
            case ".js": case ".mjs": return "text/javascript; charset=utf-8";
            case ".css": return "text/css; charset=utf-8";
            case ".json": case ".gltf": return "application/json";
            case ".wasm": return "application/wasm";
            case ".png": return "image/png";
            case ".jpg": case ".jpeg": return "image/jpeg";
            case ".svg": return "image/svg+xml";
            case ".ico": return "image/x-icon";
            case ".woff2": return "font/woff2";
            default: return "application/octet-stream";
        }
    }
    private static void Headers(Stream stream, int status, string type, long length) {
        string reason = status == 200 ? "OK" : status == 404 ? "Not Found" : status == 405 ? "Method Not Allowed" : "Bad Request";
        byte[] bytes = Encoding.ASCII.GetBytes("HTTP/1.1 " + status + " " + reason + "\r\nContent-Type: " + type + "\r\nContent-Length: " + length + "\r\nCache-Control: no-store\r\nX-Content-Type-Options: nosniff\r\nConnection: close\r\n\r\n");
        stream.Write(bytes, 0, bytes.Length);
    }
    private void Serve(TcpClient client) {
        using (client) {
            client.ReceiveTimeout = 5000; client.SendTimeout = 10000;
            try {
                using (var stream = client.GetStream()) {
                    var reader = new StreamReader(stream, Encoding.ASCII, false, 1024, true);
                    string line = reader.ReadLine();
                    if (line == null || line.Length > 8192) return;
                    string[] request = line.Split(' '); string host = ""; int size = line.Length;
                    while (!String.IsNullOrEmpty(line = reader.ReadLine())) {
                        size += line.Length;
                        if (size > 16384) { Headers(stream, 400, "text/plain", 0); return; }
                        if (line.StartsWith("Host:", StringComparison.OrdinalIgnoreCase)) host = line.Substring(5).Trim();
                    }
                    if (request.Length != 3 || (host != "127.0.0.1:" + port && host != "localhost:" + port)) { Headers(stream, 400, "text/plain", 0); return; }
                    if (request[0] != "GET" && request[0] != "HEAD") { Headers(stream, 405, "text/plain", 0); return; }
                    string relative = Uri.UnescapeDataString(request[1].Split('?')[0]);
                    if (!relative.StartsWith("/") || relative.Contains(":")) { Headers(stream, 400, "text/plain", 0); return; }
                    if (relative == "/") relative = "/act-browser.html";
                    string path = Path.GetFullPath(Path.Combine(root, relative.TrimStart('/').Replace('/', Path.DirectorySeparatorChar)));
                    if (!path.StartsWith(root, StringComparison.OrdinalIgnoreCase) || !File.Exists(path)) { Headers(stream, 404, "text/plain", 0); return; }
                    using (var file = File.OpenRead(path)) {
                        Headers(stream, 200, Mime(path), file.Length);
                        if (request[0] == "GET") file.CopyTo(stream);
                    }
                }
            } catch (IOException) { } catch (ArgumentException) { } catch (NotSupportedException) { } catch (UnauthorizedAccessException) { }
        }
    }
}
'@
$server = New-Object StarArmBrowserFiles
try {
    $actualPort = $server.Start($WebRoot, $Port)
    $url = "http://127.0.0.1:$actualPort/act-browser.html"
    Write-Host "ACT_BROWSER_LOCAL_URL=$url"
    Write-Host 'Star Arm 102 browser test is ready. Keep this window open.'
    Write-Host 'Use the browser buttons to import your model, calibration, cameras and follower.'
    Write-Host 'Stop execution in the webpage before closing this window. Ctrl+C exits.'
    if (!$NoBrowser) {
        $browsers = @("${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe", "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe", "$env:ProgramFiles\Google\Chrome\Application\chrome.exe", "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe")
        $browser = $browsers | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
        if ($browser) { Start-Process -FilePath $browser -ArgumentList $url } else { Start-Process $url }
    }
    while ($true) { Start-Sleep -Seconds 1 }
} finally { $server.Stop() }
