'use strict';

const path = require('path');
const fs = require('fs');

// 仅在项目初始化时调用
function getPath(subPath) {
  const userHome = process.env.HOME || process.env.USERPROFILE;
  const home = path.join(userHome, './.proxy-request');
  try {
    fs.accessSync(home);
  } catch (e) {
    fs.mkdirSync(home);
  }

  const targetPath = path.join(home, subPath);
  try {
    fs.accessSync(targetPath);
  } catch (e) {
    fs.mkdirSync(targetPath);
  }
  return targetPath;
}

module.exports = {
  getPath,
};
