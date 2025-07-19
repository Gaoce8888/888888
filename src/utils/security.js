import DOMPurify from 'dompurify';
import CryptoJS from 'crypto-js';

/**
 * 安全工具模块
 * 提供加密、消毒、验证等安全功能
 */

// 加密密钥（生产环境应从环境变量读取）
const ENCRYPTION_KEY = process.env.REACT_APP_ENCRYPTION_KEY || 'default-key-change-in-production';

/**
 * XSS防护 - 消毒HTML内容
 */
export const sanitizeHtml = (dirty) => {
  return DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'a', 'br', 'p'],
    ALLOWED_ATTR: ['href', 'target', 'rel']
  });
};

/**
 * 消毒文本内容
 */
export const sanitizeText = (text) => {
  if (typeof text !== 'string') return '';
  
  // 移除潜在的危险字符
  return text
    .replace(/[<>]/g, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+\s*=/gi, '')
    .trim();
};

/**
 * 加密敏感数据
 */
export const encryptData = (data) => {
  try {
    const jsonData = JSON.stringify(data);
    return CryptoJS.AES.encrypt(jsonData, ENCRYPTION_KEY).toString();
  } catch (error) {
    console.error('Encryption failed:', error);
    return null;
  }
};

/**
 * 解密数据
 */
export const decryptData = (encryptedData) => {
  try {
    const bytes = CryptoJS.AES.decrypt(encryptedData, ENCRYPTION_KEY);
    const decryptedData = bytes.toString(CryptoJS.enc.Utf8);
    return JSON.parse(decryptedData);
  } catch (error) {
    console.error('Decryption failed:', error);
    return null;
  }
};

/**
 * 生成CSRF Token
 */
export const generateCSRFToken = () => {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
};

/**
 * 验证CSRF Token
 */
export const validateCSRFToken = (token) => {
  const storedToken = sessionStorage.getItem('csrfToken');
  return token === storedToken;
};

/**
 * 安全的本地存储
 */
export class SecureStorage {
  static setItem(key, value) {
    try {
      const encrypted = encryptData(value);
      localStorage.setItem(key, encrypted);
      return true;
    } catch (error) {
      console.error('SecureStorage setItem failed:', error);
      return false;
    }
  }
  
  static getItem(key) {
    try {
      const encrypted = localStorage.getItem(key);
      if (!encrypted) return null;
      return decryptData(encrypted);
    } catch (error) {
      console.error('SecureStorage getItem failed:', error);
      return null;
    }
  }
  
  static removeItem(key) {
    localStorage.removeItem(key);
  }
  
  static clear() {
    localStorage.clear();
  }
}

/**
 * 验证输入
 */
export const validateInput = {
  // 邮箱验证
  email: (email) => {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
  },
  
  // 手机号验证（中国）
  phone: (phone) => {
    const re = /^1[3-9]\d{9}$/;
    return re.test(phone);
  },
  
  // URL验证
  url: (url) => {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  },
  
  // 消息内容验证
  message: (message) => {
    if (!message || typeof message !== 'string') return false;
    if (message.length === 0 || message.length > 10000) return false;
    
    // 检查是否包含潜在的恶意内容
    const dangerousPatterns = [
      /<script/i,
      /javascript:/i,
      /on\w+\s*=/i,
      /<iframe/i,
      /<object/i,
      /<embed/i
    ];
    
    return !dangerousPatterns.some(pattern => pattern.test(message));
  }
};

/**
 * 内容安全策略
 */
export const setContentSecurityPolicy = () => {
  const meta = document.createElement('meta');
  meta.httpEquiv = 'Content-Security-Policy';
  meta.content = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.google-analytics.com",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https:",
    "font-src 'self'",
    "connect-src 'self' ws://localhost:* wss://*",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'"
  ].join('; ');
  
  document.head.appendChild(meta);
};

/**
 * 防止点击劫持
 */
export const preventClickjacking = () => {
  if (window.top !== window.self) {
    window.top.location = window.self.location;
  }
};

/**
 * 安全的WebSocket连接
 */
export class SecureWebSocket {
  constructor(url, protocols) {
    // 验证URL
    if (!this.isValidWebSocketUrl(url)) {
      throw new Error('Invalid WebSocket URL');
    }
    
    // 添加认证token
    const authUrl = this.addAuthToUrl(url);
    
    this.ws = new WebSocket(authUrl, protocols);
    this.setupSecurityHandlers();
  }
  
  isValidWebSocketUrl(url) {
    try {
      const parsed = new URL(url);
      return ['ws:', 'wss:'].includes(parsed.protocol);
    } catch {
      return false;
    }
  }
  
  addAuthToUrl(url) {
    const parsed = new URL(url);
    const token = sessionStorage.getItem('authToken');
    const csrfToken = sessionStorage.getItem('csrfToken');
    
    if (token) {
      parsed.searchParams.set('token', token);
    }
    if (csrfToken) {
      parsed.searchParams.set('csrf', csrfToken);
    }
    
    return parsed.toString();
  }
  
  setupSecurityHandlers() {
    const originalOnMessage = this.ws.onmessage;
    
    this.ws.onmessage = (event) => {
      try {
        // 验证消息来源
        const data = JSON.parse(event.data);
        
        // 验证消息签名（如果有）
        if (data.signature && !this.verifySignature(data)) {
          console.error('Invalid message signature');
          return;
        }
        
        // 消毒消息内容
        if (data.content) {
          data.content = sanitizeText(data.content);
        }
        
        // 调用原始处理器
        if (originalOnMessage) {
          event.data = JSON.stringify(data);
          originalOnMessage.call(this.ws, event);
        }
      } catch (error) {
        console.error('Message handling error:', error);
      }
    };
  }
  
  verifySignature(data) {
    // 实现消息签名验证逻辑
    // 这里应该使用HMAC或其他签名算法
    return true; // 简化示例
  }
  
  send(data) {
    // 添加时间戳和签名
    const message = {
      ...data,
      timestamp: Date.now(),
      nonce: generateCSRFToken().substring(0, 16)
    };
    
    // 发送前验证
    if (!this.validateOutgoingMessage(message)) {
      throw new Error('Invalid outgoing message');
    }
    
    this.ws.send(JSON.stringify(message));
  }
  
  validateOutgoingMessage(message) {
    // 验证消息格式和内容
    if (!message || typeof message !== 'object') return false;
    if (message.content && !validateInput.message(message.content)) return false;
    
    return true;
  }
  
  close() {
    this.ws.close();
  }
}

/**
 * 初始化安全措施
 */
export const initializeSecurity = () => {
  // 设置CSP
  setContentSecurityPolicy();
  
  // 防止点击劫持
  preventClickjacking();
  
  // 生成CSRF Token
  if (!sessionStorage.getItem('csrfToken')) {
    sessionStorage.setItem('csrfToken', generateCSRFToken());
  }
  
  // 禁用右键菜单（可选）
  if (process.env.NODE_ENV === 'production') {
    document.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      return false;
    });
  }
  
  // 监听可疑活动
  let suspiciousActivityCount = 0;
  window.addEventListener('error', (event) => {
    if (event.message && event.message.includes('script')) {
      suspiciousActivityCount++;
      if (suspiciousActivityCount > 5) {
        console.error('Suspicious activity detected');
        // 可以发送到安全监控服务
      }
    }
  });
};