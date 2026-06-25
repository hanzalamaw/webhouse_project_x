import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [react()],
    server: {
      proxy: {
        '/api': {
          target: env.VITE_API_URL,
          changeOrigin: true,
          secure: false,
          xfwd: true,
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq, req) => {
              let clientIp = req.socket?.remoteAddress || '';
              clientIp = clientIp.replace(/^::ffff:/, '');
              if (clientIp === '::1') clientIp = '127.0.0.1';
              if (clientIp && clientIp !== '127.0.0.1') {
                proxyReq.setHeader('X-Client-Ip', clientIp);
              }
            });
          },
        },
      },
    }
  }
})
