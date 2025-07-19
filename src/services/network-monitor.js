import EventEmitter from 'eventemitter3';

/**
 * 企业级网络监控服务
 * 实时监控网络状态、质量和性能
 */
export class NetworkMonitor extends EventEmitter {
  constructor() {
    super();
    
    this.isOnline = navigator.onLine;
    this.networkType = this.getNetworkType();
    this.networkQuality = 100;
    this.latencyHistory = [];
    this.bandwidthHistory = [];
    this.packetLossHistory = [];
    
    // 监控配置
    this.config = {
      pingInterval: 5000,
      qualityCheckInterval: 10000,
      historySize: 100,
      qualityThresholds: {
        excellent: 90,
        good: 70,
        fair: 50,
        poor: 30
      }
    };
    
    // 性能指标
    this.metrics = {
      avgLatency: 0,
      avgBandwidth: 0,
      packetLoss: 0,
      jitter: 0,
      downtime: 0,
      lastDowntime: null,
      connectionChanges: 0
    };
    
    this.startMonitoring();
  }

  /**
   * 启动网络监控
   */
  startMonitoring() {
    // 监听网络状态变化
    window.addEventListener('online', this.handleOnline.bind(this));
    window.addEventListener('offline', this.handleOffline.bind(this));
    
    // 监听网络类型变化
    if ('connection' in navigator) {
      navigator.connection.addEventListener('change', this.handleConnectionChange.bind(this));
    }
    
    // 启动定期检查
    this.startPingCheck();
    this.startQualityCheck();
    
    // 初始化网络质量评估
    this.assessNetworkQuality();
  }

  /**
   * 获取网络类型
   */
  getNetworkType() {
    if ('connection' in navigator) {
      const connection = navigator.connection;
      return {
        type: connection.type || 'unknown',
        effectiveType: connection.effectiveType || 'unknown',
        downlink: connection.downlink || 0,
        rtt: connection.rtt || 0,
        saveData: connection.saveData || false
      };
    }
    return { type: 'unknown', effectiveType: 'unknown' };
  }

  /**
   * 处理上线事件
   */
  handleOnline() {
    console.log('[NetworkMonitor] Network online');
    this.isOnline = true;
    
    if (this.metrics.lastDowntime) {
      this.metrics.downtime += Date.now() - this.metrics.lastDowntime;
      this.metrics.lastDowntime = null;
    }
    
    this.emit('online');
    this.assessNetworkQuality();
  }

  /**
   * 处理离线事件
   */
  handleOffline() {
    console.log('[NetworkMonitor] Network offline');
    this.isOnline = false;
    this.metrics.lastDowntime = Date.now();
    this.networkQuality = 0;
    
    this.emit('offline');
    this.emit('qualityChange', 0);
  }

  /**
   * 处理网络类型变化
   */
  handleConnectionChange() {
    const oldType = this.networkType;
    this.networkType = this.getNetworkType();
    this.metrics.connectionChanges++;
    
    console.log('[NetworkMonitor] Network type changed:', this.networkType);
    
    this.emit('connectionChange', {
      old: oldType,
      new: this.networkType
    });
    
    // 重新评估网络质量
    this.assessNetworkQuality();
  }

  /**
   * 启动Ping检查
   */
  startPingCheck() {
    this.pingInterval = setInterval(() => {
      if (this.isOnline) {
        this.performPingCheck();
      }
    }, this.config.pingInterval);
  }

  /**
   * 执行Ping检查
   */
  async performPingCheck() {
    const startTime = performance.now();
    
    try {
      // 使用图片加载测试延迟
      const img = new Image();
      const timeout = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Timeout')), 5000)
      );
      
      const load = new Promise((resolve) => {
        img.onload = resolve;
        img.onerror = resolve;
      });
      
      img.src = `https://www.google.com/favicon.ico?_=${Date.now()}`;
      
      await Promise.race([load, timeout]);
      
      const latency = performance.now() - startTime;
      this.recordLatency(latency);
      
    } catch (error) {
      // 记录超时或错误
      this.recordLatency(5000);
      this.recordPacketLoss();
    }
  }

  /**
   * 记录延迟
   */
  recordLatency(latency) {
    this.latencyHistory.push({
      value: latency,
      timestamp: Date.now()
    });
    
    // 保持历史记录大小
    if (this.latencyHistory.length > this.config.historySize) {
      this.latencyHistory.shift();
    }
    
    // 计算平均延迟和抖动
    this.calculateLatencyMetrics();
  }

  /**
   * 计算延迟指标
   */
  calculateLatencyMetrics() {
    if (this.latencyHistory.length === 0) return;
    
    const latencies = this.latencyHistory.map(h => h.value);
    this.metrics.avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
    
    // 计算抖动（延迟变化）
    if (latencies.length > 1) {
      let jitterSum = 0;
      for (let i = 1; i < latencies.length; i++) {
        jitterSum += Math.abs(latencies[i] - latencies[i - 1]);
      }
      this.metrics.jitter = jitterSum / (latencies.length - 1);
    }
  }

  /**
   * 记录丢包
   */
  recordPacketLoss() {
    this.packetLossHistory.push({
      timestamp: Date.now()
    });
    
    // 计算丢包率
    const recentPackets = this.packetLossHistory.filter(
      p => Date.now() - p.timestamp < 60000 // 最近1分钟
    );
    
    this.metrics.packetLoss = (recentPackets.length / 12) * 100; // 假设每5秒一个包
  }

  /**
   * 启动质量检查
   */
  startQualityCheck() {
    this.qualityInterval = setInterval(() => {
      this.assessNetworkQuality();
    }, this.config.qualityCheckInterval);
    
    // 立即执行一次
    this.assessNetworkQuality();
  }

  /**
   * 评估网络质量
   */
  assessNetworkQuality() {
    if (!this.isOnline) {
      this.networkQuality = 0;
      this.emit('qualityChange', 0);
      return;
    }
    
    let quality = 100;
    
    // 基于延迟评分
    if (this.metrics.avgLatency > 0) {
      if (this.metrics.avgLatency < 50) {
        quality -= 0;
      } else if (this.metrics.avgLatency < 100) {
        quality -= 10;
      } else if (this.metrics.avgLatency < 200) {
        quality -= 20;
      } else if (this.metrics.avgLatency < 500) {
        quality -= 40;
      } else {
        quality -= 60;
      }
    }
    
    // 基于抖动评分
    if (this.metrics.jitter > 50) {
      quality -= 10;
    } else if (this.metrics.jitter > 100) {
      quality -= 20;
    }
    
    // 基于丢包率评分
    if (this.metrics.packetLoss > 0) {
      quality -= this.metrics.packetLoss * 2;
    }
    
    // 基于网络类型评分
    if (this.networkType.effectiveType === 'slow-2g') {
      quality -= 30;
    } else if (this.networkType.effectiveType === '2g') {
      quality -= 20;
    } else if (this.networkType.effectiveType === '3g') {
      quality -= 10;
    }
    
    // 确保质量在0-100之间
    quality = Math.max(0, Math.min(100, quality));
    
    const oldQuality = this.networkQuality;
    this.networkQuality = quality;
    
    // 如果质量变化超过10%，触发事件
    if (Math.abs(oldQuality - quality) > 10) {
      this.emit('qualityChange', quality);
      console.log(`[NetworkMonitor] Network quality changed: ${quality}%`);
    }
    
    return quality;
  }

  /**
   * 获取网络质量等级
   */
  getQualityLevel() {
    if (this.networkQuality >= this.config.qualityThresholds.excellent) {
      return 'excellent';
    } else if (this.networkQuality >= this.config.qualityThresholds.good) {
      return 'good';
    } else if (this.networkQuality >= this.config.qualityThresholds.fair) {
      return 'fair';
    } else if (this.networkQuality >= this.config.qualityThresholds.poor) {
      return 'poor';
    } else {
      return 'offline';
    }
  }

  /**
   * 测试带宽
   */
  async testBandwidth() {
    if (!this.isOnline) return 0;
    
    const testSize = 100000; // 100KB
    const testData = new Uint8Array(testSize);
    const startTime = performance.now();
    
    try {
      // 模拟下载测试
      const response = await fetch('https://www.google.com/images/branding/googlelogo/1x/googlelogo_color_272x92dp.png', {
        cache: 'no-store'
      });
      
      const data = await response.arrayBuffer();
      const endTime = performance.now();
      const duration = (endTime - startTime) / 1000; // 秒
      const bandwidth = (data.byteLength * 8) / duration / 1000000; // Mbps
      
      this.bandwidthHistory.push({
        value: bandwidth,
        timestamp: Date.now()
      });
      
      if (this.bandwidthHistory.length > this.config.historySize) {
        this.bandwidthHistory.shift();
      }
      
      // 计算平均带宽
      const bandwidths = this.bandwidthHistory.map(h => h.value);
      this.metrics.avgBandwidth = bandwidths.reduce((a, b) => a + b, 0) / bandwidths.length;
      
      return bandwidth;
      
    } catch (error) {
      console.error('[NetworkMonitor] Bandwidth test failed:', error);
      return 0;
    }
  }

  /**
   * 获取网络状态报告
   */
  getNetworkStatus() {
    return {
      online: this.isOnline,
      quality: this.networkQuality,
      qualityLevel: this.getQualityLevel(),
      type: this.networkType,
      metrics: {
        ...this.metrics,
        uptime: this.metrics.lastDowntime ? 
          Date.now() - this.metrics.lastDowntime : 
          (this.isOnline ? 100 : 0)
      },
      history: {
        latency: this.latencyHistory.slice(-10),
        bandwidth: this.bandwidthHistory.slice(-10),
        packetLoss: this.packetLossHistory.slice(-10)
      }
    };
  }

  /**
   * 预测网络稳定性
   */
  predictStability() {
    if (this.latencyHistory.length < 10) {
      return { stable: true, confidence: 0 };
    }
    
    const recentLatencies = this.latencyHistory.slice(-10).map(h => h.value);
    const avgLatency = recentLatencies.reduce((a, b) => a + b, 0) / recentLatencies.length;
    const variance = recentLatencies.reduce((sum, lat) => sum + Math.pow(lat - avgLatency, 2), 0) / recentLatencies.length;
    const stdDev = Math.sqrt(variance);
    
    // 稳定性基于标准差
    const stable = stdDev < avgLatency * 0.3; // 标准差小于平均值的30%
    const confidence = Math.min(100, (1 - stdDev / avgLatency) * 100);
    
    return { stable, confidence };
  }

  /**
   * 停止监控
   */
  stop() {
    window.removeEventListener('online', this.handleOnline);
    window.removeEventListener('offline', this.handleOffline);
    
    if ('connection' in navigator) {
      navigator.connection.removeEventListener('change', this.handleConnectionChange);
    }
    
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
    }
    
    if (this.qualityInterval) {
      clearInterval(this.qualityInterval);
    }
    
    this.removeAllListeners();
  }
}