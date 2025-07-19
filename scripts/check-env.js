#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

console.log('🔍 检查企业级项目环境配置...\n');

const checks = {
  环境变量: {
    passed: false,
    message: ''
  },
  安全依赖: {
    passed: false,
    message: ''
  },
  日志系统: {
    passed: false,
    message: ''
  },
  代码规范: {
    passed: false,
    message: ''
  }
};

// 检查环境变量文件
function checkEnvFiles() {
  const envFiles = ['.env', '.env.example', '.env.production'];
  const missingFiles = [];
  
  envFiles.forEach(file => {
    if (!fs.existsSync(path.join(process.cwd(), file))) {
      missingFiles.push(file);
    }
  });
  
  if (missingFiles.length === 0) {
    checks.环境变量.passed = true;
    checks.环境变量.message = '✅ 所有环境变量文件已配置';
  } else {
    checks.环境变量.message = `❌ 缺少文件: ${missingFiles.join(', ')}`;
  }
}

// 检查安全依赖
function checkSecurityDeps() {
  try {
    const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    const requiredDeps = ['dompurify', 'crypto-js', '@sentry/react', 'helmet'];
    const missingDeps = [];
    
    requiredDeps.forEach(dep => {
      if (!packageJson.dependencies || !packageJson.dependencies[dep]) {
        missingDeps.push(dep);
      }
    });
    
    if (missingDeps.length === 0) {
      checks.安全依赖.passed = true;
      checks.安全依赖.message = '✅ 所有安全依赖已安装';
    } else {
      checks.安全依赖.message = `❌ 缺少依赖: ${missingDeps.join(', ')}`;
    }
  } catch (error) {
    checks.安全依赖.message = '❌ 无法读取package.json';
  }
}

// 检查日志系统
function checkLoggerSystem() {
  const loggerPath = path.join(process.cwd(), 'src/utils/logger.js');
  
  if (fs.existsSync(loggerPath)) {
    const content = fs.readFileSync(loggerPath, 'utf8');
    
    // 检查是否还有console.log
    const srcDir = path.join(process.cwd(), 'src');
    let consoleCount = 0;
    
    function walkDir(dir) {
      const files = fs.readdirSync(dir);
      files.forEach(file => {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);
        
        if (stat.isDirectory() && file !== '__tests__') {
          walkDir(filePath);
        } else if (stat.isFile() && file.endsWith('.js')) {
          const content = fs.readFileSync(filePath, 'utf8');
          const matches = content.match(/console\.(log|error|warn|info)/g);
          if (matches) {
            consoleCount += matches.length;
          }
        }
      });
    }
    
    walkDir(srcDir);
    
    if (consoleCount === 0) {
      checks.日志系统.passed = true;
      checks.日志系统.message = '✅ 日志系统已配置，无console语句';
    } else {
      checks.日志系统.message = `⚠️  日志系统已配置，但发现 ${consoleCount} 个console语句`;
    }
  } else {
    checks.日志系统.message = '❌ 未找到日志系统文件';
  }
}

// 检查代码规范工具
function checkCodeQuality() {
  const requiredFiles = ['.eslintrc.js', '.prettierrc'];
  const missingFiles = [];
  
  requiredFiles.forEach(file => {
    if (!fs.existsSync(path.join(process.cwd(), file))) {
      missingFiles.push(file);
    }
  });
  
  if (missingFiles.length === 0) {
    checks.代码规范.passed = true;
    checks.代码规范.message = '✅ 代码规范工具已配置';
  } else {
    checks.代码规范.message = `❌ 缺少配置文件: ${missingFiles.join(', ')}`;
  }
}

// 运行所有检查
checkEnvFiles();
checkSecurityDeps();
checkLoggerSystem();
checkCodeQuality();

// 输出结果
console.log('📊 检查结果:\n');

let allPassed = true;
Object.entries(checks).forEach(([name, result]) => {
  console.log(`${name}: ${result.message}`);
  if (!result.passed) {
    allPassed = false;
  }
});

if (allPassed) {
  console.log('\n✅ 恭喜！项目已满足企业级标准配置要求！');
} else {
  console.log('\n⚠️  项目还需要一些配置才能满足企业级标准。');
  console.log('\n建议的下一步操作：');
  
  if (!checks.环境变量.passed) {
    console.log('- 创建缺少的环境变量文件');
  }
  if (!checks.安全依赖.passed) {
    console.log('- 运行 npm install 安装缺少的安全依赖');
  }
  if (!checks.日志系统.passed) {
    console.log('- 运行 npm run fix:console 替换console语句');
  }
  if (!checks.代码规范.passed) {
    console.log('- 创建ESLint和Prettier配置文件');
  }
}

console.log('\n💡 提示: 运行 npm run build:prod 进行生产构建');

process.exit(allPassed ? 0 : 1);