export default {
    async fetch(request, env) {
        // 1. 处理路由
        const url = new URL(request.url);

        // 路由：如果是 API 请求
        if (url.pathname === '/api/data') {
            return handleApiRequest(request, env);
        }

        // 路由：如果是点击按钮的请求
        if (url.pathname === '/api/click') {
            return handleClickRequest(request, env);
        }

        // 路由：根路径，返回网页
        return handleHtmlRequest(request, env);
    }
};

// 处理网页返回 (包含内联的 HTML/CSS/JS)
async function handleHtmlRequest(request, env) {
    // 获取 Cookie
    const cookie = request.headers.get('Cookie') || '';
    const cookies = parseCookies(cookie);

    // 如果没有访问者 ID，说明是新访客
    let visitorId = cookies.visitor_id;
    let isReturningVisitor = !!visitorId;

    if (!isReturningVisitor) {
        // 生成新访客 ID (简单的时间戳+随机数)
        visitorId = Date.now().toString(36) + Math.random().toString(36).substr(2);
    }

    // 构建 HTML 页面
    const html = buildHtmlPage(visitorId, isReturningVisitor);

    // 准备响应
    const response = new Response(html, {
        headers: {
            'Content-Type': 'text/html;charset=UTF-8',
            'Cache-Control': 'no-cache'
        }
    });

    // 如果是新访客，设置 Cookie
    if (!isReturningVisitor) {
        response.headers.append('Set-Cookie', `visitor_id=${visitorId}; Path=/; Max-Age=31536000; SameSite=Lax`);
    }

    return response;
}

// 处理获取数据的 API
async function handleApiRequest(request, env) {
    try {
        // 从 D1 数据库读取数据
        const { results } = await env.DB.prepare(
            "SELECT total_clicks, total_visitors FROM counters WHERE id = 1"
        ).first();

        const data = results || { total_clicks: 0, total_visitors: 0 };

        // 获取请求头中的 Cookie 来获取个人点击数
        const cookie = request.headers.get('Cookie') || '';
        const userClicks = getCookieValue(cookie, 'user_clicks') || '0';

        return new Response(
            JSON.stringify({
                ...data,
                user_clicks: parseInt(userClicks),
            }),
            { headers: { 'Content-Type': 'application/json' } }
        );
    } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500 });
    }
}

// 处理点击事件
async function handleClickRequest(request, env) {
    if (request.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });

    try {
        // 1. 更新数据库：总点击数 +1
        await env.DB.prepare(
            "UPDATE counters SET total_clicks = total_clicks + 1 WHERE id = 1"
        ).run();

        // 2. 获取最新的数据库数据
        const { results } = await env.DB.prepare(
            "SELECT total_clicks, total_visitors FROM counters WHERE id = 1"
        ).first();

        const dbData = results;

        // 3. 处理个人点击数 (基于 Cookie)
        const cookie = request.headers.get('Cookie') || '';
        let userClicks = (parseInt(getCookieValue(cookie, 'user_clicks')) || 0) + 1;

        // 构建返回数据
        const responseData = {
            total_clicks: dbData.total_clicks,
            total_visitors: dbData.total_visitors,
            user_clicks: userClicks
        };

        const response = new Response(JSON.stringify(responseData), {
            headers: { 'Content-Type': 'application/json' }
        });

        // 设置 Cookie 保存个人点击数
        response.headers.append('Set-Cookie', `user_clicks=${userClicks}; Path=/; Max-Age=31536000; SameSite=Lax`);

        return response;
    } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500 });
    }
}

// 解析 Cookie 字符串
function parseCookies(cookieHeader) {
    const cookies = {};
    if (!cookieHeader) return cookies;
    cookieHeader.split(';').forEach(cookie => {
        const [key, value] = cookie.trim().split('=');
        if (key) cookies[key] = value;
    });
    return cookies;
}

// 获取单个 Cookie 值
function getCookieValue(cookieHeader, key) {
    const cookies = parseCookies(cookieHeader);
    return cookies[key];
}

// --- 前端页面构建 ---
function buildHtmlPage(visitorId, isReturningVisitor) {
    return `<!DOCTYPE html>
    <html lang="zh-CN">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
        <title>云端计数器</title>
        <style>
            /* 全局样式与渐变背景 */
            * { box-sizing: border-box; margin: 0; padding: 0; }
            body { 
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
                background: linear-gradient(135deg, #667eea, #764ba2);
                color: white;
                min-height: 100vh;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                padding: 20px;
                text-align: center;
                line-height: 1.6;
            }
            .container { max-width: 500px; width: 100%; }
            
            /* 卡片样式 */
            .card { 
                background: rgba(255, 255, 255, 0.1);
                backdrop-filter: blur(10px);
                -webkit-backdrop-filter: blur(10px);
                border-radius: 20px;
                padding: 30px;
                margin: 20px 0;
                box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
                border: 1px solid rgba(255, 255, 255, 0.2);
                transition: transform 0.2s;
            }
            .card:hover { transform: translateY(-5px); }
            
            h1 { font-size: 2.5em; margin-bottom: 20px; text-shadow: 2px 2px 4px rgba(0,0,0,0.5); }
            .time { font-size: 1.4em; margin: 15px 0; opacity: 0.9; }
            .counter { font-size: 3em; font-weight: bold; margin: 20px 0; color: #ffeb3b; text-shadow: 0 0 10px rgba(255, 235, 59, 0.5); }
            
            // 按钮样式 
            button { 
                background: linear-gradient(45deg, #ff5252, #ff4081);
                color: white;
                border: none;
                padding: 15px 50px;
                font-size: 1.2em;
                border-radius: 50px;
                cursor: pointer;
                box-shadow: 0 4px 15px rgba(255, 64, 129, 0.4);
                transition: all 0.3s ease;
                margin-top: 20px;
                font-weight: bold;
            }
            button:hover { transform: translateY(-2px) scale(1.05); box-shadow: 0 6px 20px rgba(255, 64, 129, 0.6); }
            button:active { transform: scale(0.98); }
            
            //统计信息 
            .stats { font-size: 1em; margin-top: 20px; opacity: 0.85; }
            .stats p { margin: 8px 0; }
            
            //响应式调整 
            @media (max-width: 480px) {
                .card { padding: 20px; }
                h1 { font-size: 2em; }
                .counter { font-size: 2.2em; }
                button { padding: 12px 30px; font-size: 1em; }
            }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="card">
                <h1>云端点击计数器</h1>
                <div class="time" id="time">北京时间: 加载中...</div>
                
                <div class="counter">
                    总点击: <span id="totalClicks">0</span>
                </div>
                
                <button id="clickBtn">点击一下</button>
                
                <div class="stats">
                    <p>您是第 <span id="visitorStatus">${isReturningVisitor ? '回访' : '新'}访客</span></p>
                    <p>您个人点击了 <span id="userClicks">0</span> 次</p>
                    <p>本站共接待 <span id="totalVisitors">0</span> 人</p>
                </div>
            </div>
        </div>

        <script>
            // --- 前端逻辑 ---
            document.addEventListener('DOMContentLoaded', function() {
                const clickBtn = document.getElementById('clickBtn');
                const totalClicksEl = document.getElementById('totalClicks');
                const userClicksEl = document.getElementById('userClicks');
                const totalVisitorsEl = document.getElementById('totalVisitors');
                const timeEl = document.getElementById('time');

                // 1. 获取初始数据
                async function refreshData() {
                    try {
                        const res = await fetch('/api/data');
                        const data = await res.json();
                        
                        totalClicksEl.textContent = data.total_clicks;
                        userClicksEl.textContent = data.user_clicks;
                        totalVisitorsEl.textContent = data.total_visitors;
                    } catch (err) {
                        console.error('数据加载失败:', err);
                    }
                }
                // 2. 处理点击事件
                clickBtn.addEventListener('click', async () => {
                    try {
                        clickBtn.disabled = true;
                        clickBtn.textContent = '发送中...';
                        
                        const response = await fetch('/api/click', {
                            method: 'POST'
                        });
                        
                        const data = await response.json();
                        
                        // 更新页面数据
                        totalClicksEl.textContent = data.total_clicks;
                        userClicksEl.textContent = data.user_clicks;
                        totalVisitorsEl.textContent = data.total_visitors;
                        
                    } catch (err) {
                        alert('操作失败: ' + err.message);
                    } finally {
                        clickBtn.disabled = false;
                        clickBtn.textContent = '点击一下';
                    }
                });

                // 3. 显示北京时间 (JS 客户端计算，更准确)
                function updateBeijingTime() {
                    // 获取当前时间
                    const now = new Date();
                    
                    // 手动设置为 UTC+8 (北京时间)
                    const beijingTimeMs = now.getTime() + (8 * 60 * 60 * 1000);
                    const beijingTime = new Date(beijingTimeMs);
                    
                    // 格式化输出 HH:MM:SS
                    const hours = beijingTime.getUTCHours().toString().padStart(2, '0');
                    const minutes = beijingTime.getUTCMinutes().toString().padStart(2, '0');
                    const seconds = beijingTime.getUTCSeconds().toString().padStart(2, '0');
                    
                    timeEl.textContent = "北京时间: " + \`\${hours}:\${minutes}:\${seconds}\`;
                }

                // 立即执行一次
                refreshData();
                updateBeijingTime();
                
                // 每秒更新一次时间
                setInterval(updateBeijingTime, 1000);
            });
        </script>
    </body>
    </html>`;
}
