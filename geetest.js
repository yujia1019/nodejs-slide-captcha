"use strict"

const webdriver = require('selenium-webdriver')
const chrome = require('selenium-webdriver/chrome')
const cv = require('opencv4nodejs')
const cvtest = require('./opencv_test')
const uuid = require('node-uuid')

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

var sliceMat
var bgMat
function getNotch(slicePng, bgPng){
  //处理slice图片
  const sliceBuffer = new Buffer(slicePng, 'base64')
  sliceMat = cv.imdecode(sliceBuffer)
  const sliceGrayMat = sliceMat.bgrToGray()
  const sliceThreMat = sliceGrayMat.threshold(240, 255, cv.THRESH_BINARY)
  const sliceCannyMat = sliceThreMat.canny(50, 130)
  const sliceContours = sliceCannyMat.findContours(cv.RETR_EXTERNAL, cv.CHAIN_APPROX_NONE)
  const sliceSortedContours = sliceContours.sort((c0, c1)=> c1.area - c0.area)
  var notchRect = sliceSortedContours[0].boundingRect()
  var width = notchRect.width + 2 * notchRect.x > sliceMat.width ? sliceMat.width : notchRect.width + 2 * notchRect.x
  const sliceMatchMat = sliceGrayMat.getRegion(new cv.Rect(0, notchRect.y, width, notchRect.height))

  cv.imwrite("./geetest/slice.jpg", sliceMat)
  cv.imwrite("./geetest/slice_gray.jpg", sliceGrayMat)
  cv.imwrite("./geetest/slice_match.jpg", sliceMatchMat)

  //处理background图片
  const bgBuffer = new Buffer(bgPng, 'base64')
  bgMat = cv.imdecode(bgBuffer)
  const bgGrayMat = bgMat.bgrToGray()
  var matched = bgGrayMat.matchTemplate(sliceMatchMat, cv.TM_CCOEFF_NORMED);

  // Use minMaxLoc to locate the highest value (or lower, depending of the type of matching method)
  const minMax = matched.minMaxLoc();
  const { maxLoc: { x, y } } = minMax;

  // Draw bounding rectangle
  bgGrayMat.drawRectangle(
      new cv.Rect(x, y, sliceGrayMat.cols, sliceGrayMat.rows),
      new cv.Vec(0, 255, 0),
      2,
      cv.LINE_8
  );

  console.log("bg width:" + bgMat.cols + ", height:" + bgMat.rows)
  cv.imwrite("./geetest/bg.jpg", bgMat)
  cv.imwrite("./geetest/bg_gray.jpg", bgGrayMat)
  return x;
}

function getTracks(distance){
  var tracks = [ ]  //滑动轨迹
  var moveNum = 40  //移动次数
  var disThreUp = distance * 0.2 //距离加速阈值 
  var moveThreUp = moveNum * 0.2 //移动次数加速阈值
  var disThreDown = distance * 0.8 //减速阈值
  var moveThreDown = moveNum * 0.4 //移动次数减速阈值
  var upAcce = 2 * disThreUp / Math.pow(moveThreUp, 2) //加速阶段加速度
  var maxSpeed = upAcce * moveThreUp
  var downAcce = 2 * ((distance - disThreDown) - maxSpeed * (moveNum - moveThreDown)) / Math.pow(moveNum - moveThreDown, 2) //减速阶段加速度
  console.log("up a:" + upAcce + ", down a:" + downAcce + "max speed:" + maxSpeed)

  var v = 0 //初速度
  var curDis = 0 //当前距离 
  var curMove = 0 //当前移动距离
  var a = 0 //加速度
  var randomDis = 0;
  var timeBase = 0;
  while(curDis < distance){
    if(curMove < moveThreUp){
      a = upAcce
      timeBase = 10
      randomDis = 0.5 * Math.random()
    }else if(curMove < moveThreDown){  
      a = 0
      timeBase = 10
      randomDis = 2 * Math.random() - 1
    }else{
      a = downAcce
      timeBase = 10
      randomDis = 0.5 * Math.random()
    }
  
    var moveDis = Math.floor(v + randomDis) 
    if(curDis + moveDis > distance){
      moveDis = distance - curDis
    }
    
    var location = {}
    location.x = moveDis
    location.y = Math.round(Math.random() * 0.6)
    location.time = timeBase + Math.round(10 * Math.random()) 
    tracks.push(location);
    curDis += moveDis
    curMove++
    v = v + a
    if(v < 0){
      v = Math.round(Math.random()) + Math.round(Math.random())
    }
  }
  
  //console.log(tracks)
  return tracks;
}


async function verify() {
  var driver = await new webdriver.Builder().forBrowser('chrome').build()
  const url = 'http://www.geetest.com/type/'
  await driver.get(url)
  await sleep(3000)
  
  await driver.findElement(webdriver.By.css('.products-content li:nth-child(2)')).click()
  await sleep(3000)

  await driver.findElement(webdriver.By.css('.geetest_radar_tip')).click()
  await sleep(3000)

  //截取原始验证码图片
  const bgImg = await driver.findElement(webdriver.By.css('.geetest_canvas_bg'))
  const originPng = await bgImg.takeScreenshot()
  var originBuffer = new Buffer(originPng, 'base64')
  const originMat = cv.imdecode(originBuffer)
  cv.imwrite("./geetest/origin.jpg", originMat)

  //截取slice图片
  await driver.executeScript(`document.querySelector('.geetest_canvas_bg').style.display = 'none'`)
  const sliceImg = await driver.findElement(webdriver.By.css('.geetest_canvas_slice'))
  const slicePng = await sliceImg.takeScreenshot()
  
  //截取background图片
  await driver.executeScript(`document.querySelector('.geetest_canvas_slice').style.display = 'none'`)
  await driver.executeScript(`document.querySelector('.geetest_canvas_bg').style.display = 'block'`)
  const bgPng = await bgImg.takeScreenshot()
  const bgSize = await bgImg.getSize();

  //定位缺口
  const slideDistance = Math.floor(getNotch(slicePng, bgPng) * bgSize.width / bgMat.cols) 
  console.log("slide distance:" + slideDistance)

  //获取滑动轨迹
  var tracks = getTracks(slideDistance)
  
  await driver.executeScript(`document.querySelector('.geetest_canvas_slice').style.display = 'block'`)
  const slideBtn = await driver.findElement(webdriver.By.className('geetest_slider_button'))
  
  //console.log("mouse down start...")
  let actions = driver.actions({async: true})
  actions.mouseMove(slideBtn).mouseDown().perform()
  
  const downTime = 150 + Math.round(Math.random() * 20)
  //console.log("mouse move start..." + downTime)
  await sleep(downTime)
  for(var i = 0; i < tracks.length; i++){
    let actions = driver.actions({async: true})
    await actions.mouseMove(tracks[i]).perform()

    //console.log("x:" + tracks[i].x + ", y:" + tracks[i].y + ", span:" + tracks[i].time)
    await sleep(tracks[i].time)
  }

  const upTime = 150 + Math.round(Math.random() * 20)
  //console.log("mouse up start..." + upTime)
  await sleep(upTime)
  actions = driver.actions({async: true})
  await actions.mouseUp().perform()
  await sleep(2000)
  const tip = await driver.findElement(webdriver.By.css('.geetest_radar_tip')).getAttribute('aria-label')
  if(!tip || tip != '验证成功'){
    console.log("验证失败")
    var tag = uuid.v1()
    cv.imwrite("./geetest/failImg/" + tag + "_slice.jpg", sliceMat)
    cv.imwrite("./geetest/failImg/" + tag + "_bg.jpg", bgMat)
  }else{
    console.log("验证成功")
  }
  await sleep(1000)
  driver.quit()
  return tip == '验证成功'
}

!async function(){
  var num = 100
  var succ = 0
  for(var i = 0; i < num; i++){
    console.log(">>>>>>>>>>>>> start " + i + " attempt >>>>>>>>>>>>>>>>>>>")
    try{
      const result = await verify()
      if(result){
        succ++
      }
    }catch(err){
      console.log(err)
    }
    
    await sleep(1000)
  }

  console.log("")
  console.log("*****************************")
  console.log("total:" + num + ", success:" + succ + ", fail:" + (num - succ) + ", success rate:" + (succ/num * 100) + "%")
  console.log("*****************************")
}()


