module.exports = {
  extends: [
    'react-app',
    'react-app/jest',
    'plugin:security/recommended'
  ],
  plugins: ['security'],
  rules: {
    // 安全规则
    'no-eval': 'error',
    'no-implied-eval': 'error',
    'no-new-func': 'error',
    'security/detect-eval-with-expression': 'error',
    'security/detect-non-literal-regexp': 'warn',
    'security/detect-unsafe-regex': 'error',
    
    // React规则
    'react/jsx-no-target-blank': 'error',
    'react/no-danger': 'error',
    'react/no-danger-with-children': 'error',
    
    // 生产环境规则
    'no-console': process.env.NODE_ENV === 'production' ? 'error' : 'warn',
    'no-debugger': 'error',
    
    // 代码质量
    'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    'no-use-before-define': 'error',
    'prefer-const': 'error',
    'no-var': 'error',
    
    // 性能相关
    'react/jsx-no-bind': ['warn', {
      allowArrowFunctions: true,
      allowBind: false,
      ignoreRefs: true
    }],
    'react-hooks/exhaustive-deps': 'warn',
    'react-hooks/rules-of-hooks': 'error'
  }
};