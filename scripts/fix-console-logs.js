const fs = require('fs');
const path = require('path');

// 导入logger的相对路径映射
const getLoggerImportPath = (filePath) => {
  const depth = filePath.split(path.sep).filter(p => p && p !== '.').length - 1;
  if (depth === 0) return './utils/logger';
  return '../'.repeat(depth) + 'utils/logger';
};

// 需要处理的文件扩展名
const extensions = ['.js', '.jsx'];

// 排除的目录
const excludeDirs = ['node_modules', 'build', 'dist', '.git', 'coverage', '__tests__'];

// 统计信息
let stats = {
  filesProcessed: 0,
  consolesReplaced: 0,
  filesModified: 0
};

// 递归遍历目录
function walkDir(dir) {
  const files = fs.readdirSync(dir);
  
  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isDirectory()) {
      if (!excludeDirs.includes(file)) {
        walkDir(filePath);
      }
    } else if (stat.isFile() && extensions.includes(path.extname(file))) {
      processFile(filePath);
    }
  });
}

// 处理单个文件
function processFile(filePath) {
  stats.filesProcessed++;
  
  let content = fs.readFileSync(filePath, 'utf8');
  let modified = false;
  let hasLoggerImport = false;
  
  // 检查是否已经导入了logger
  const importRegex = /import\s+(?:logger|{[^}]*(?:debug|info|warn|error)[^}]*})\s+from\s+['"][^'"]*logger['"]/;
  hasLoggerImport = importRegex.test(content);
  
  // 替换console.log
  const consoleLogRegex = /console\.log\s*\(/g;
  if (consoleLogRegex.test(content)) {
    content = content.replace(consoleLogRegex, 'logger.debug(');
    modified = true;
    stats.consolesReplaced++;
  }
  
  // 替换console.error
  const consoleErrorRegex = /console\.error\s*\(/g;
  if (consoleErrorRegex.test(content)) {
    content = content.replace(consoleErrorRegex, 'logger.error(');
    modified = true;
    stats.consolesReplaced++;
  }
  
  // 替换console.warn
  const consoleWarnRegex = /console\.warn\s*\(/g;
  if (consoleWarnRegex.test(content)) {
    content = content.replace(consoleWarnRegex, 'logger.warn(');
    modified = true;
    stats.consolesReplaced++;
  }
  
  // 替换console.info
  const consoleInfoRegex = /console\.info\s*\(/g;
  if (consoleInfoRegex.test(content)) {
    content = content.replace(consoleInfoRegex, 'logger.info(');
    modified = true;
    stats.consolesReplaced++;
  }
  
  // 如果文件被修改且没有logger导入，添加导入语句
  if (modified && !hasLoggerImport) {
    const loggerPath = getLoggerImportPath(path.relative('src', filePath));
    
    // 查找第一个import语句的位置
    const firstImportMatch = content.match(/^import\s+.*$/m);
    if (firstImportMatch) {
      const insertPos = firstImportMatch.index + firstImportMatch[0].length;
      content = content.slice(0, insertPos) + 
                `\nimport logger from '${loggerPath}';` + 
                content.slice(insertPos);
    } else {
      // 如果没有import语句，在文件开头添加
      content = `import logger from '${loggerPath}';\n\n` + content;
    }
  }
  
  // 特殊处理：保留某些特定的console使用
  // 例如：性能测量、开发工具等
  content = content.replace(/logger\.log\s*\(\s*['"]%c/g, 'console.log(\'%c');
  content = content.replace(/logger\.table\s*\(/g, 'console.table(');
  content = content.replace(/logger\.group/g, 'console.group');
  
  if (modified) {
    fs.writeFileSync(filePath, content, 'utf8');
    stats.filesModified++;
    console.log(`✓ Fixed: ${filePath}`);
  }
}

// 主函数
function main() {
  console.log('🔧 Starting console.log replacement...\n');
  
  const srcDir = path.join(process.cwd(), 'src');
  
  if (!fs.existsSync(srcDir)) {
    console.error('❌ src directory not found!');
    process.exit(1);
  }
  
  walkDir(srcDir);
  
  console.log('\n📊 Summary:');
  console.log(`Files processed: ${stats.filesProcessed}`);
  console.log(`Files modified: ${stats.filesModified}`);
  console.log(`Console statements replaced: ${stats.consolesReplaced}`);
  
  if (stats.filesModified > 0) {
    console.log('\n✅ Console.log replacement completed successfully!');
    console.log('\n⚠️  Please review the changes and test your application.');
  } else {
    console.log('\n✅ No console statements found to replace.');
  }
}

// 运行脚本
main();