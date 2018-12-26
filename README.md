# 简介
滑动验证码模拟主要有两种思路：
一是追踪前端请求参数，再逆向工程分析参数的js计算过程，模拟轨迹及其计算过程获取请求参数，已此实现破解；技术难度更高，破解后访问效率更高，但受js代码频繁升级的影响很大。
二是直接利用selenium调用浏览器或phantomjs，模拟鼠标轨迹过程，实现破解。实现难度相对低些，访问效率相对低些，但一旦破解，如果不升级轨迹的智能检测程度，则基本可长期使用。

我们采用第二种方法进行滑动验证码破解，主要包括以下步骤：
- 采用selenium-webdriver模拟鼠标点击，网页弹出滑块验证码；
- 采用元素截图获取拼图缺失的背景图；
- 根据元素截图寻找滑动点（难点）；
- 模拟鼠标滑动（必须采用特殊轨迹，有机器学习检测）。

寻找滑动点采用的opencv的matchTemple来实现的，anjuke基本能100%定位准确，geetest准确率在75%左右。
模拟鼠标滑动轨迹算法利用多次手动模拟采样分析得到，采用先加速、再匀速，后减速轨迹，针对机器学习检测基本能100%成功。

# nodejs-slide-captcha
some trys about slide captcha with webdriver
