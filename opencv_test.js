"use strict"

const webdriver = require('selenium-webdriver')
const chrome = require('selenium-webdriver/chrome')
const cv = require('opencv4nodejs')

const sliceThre = 240
const average = arr => arr.reduce((acc, val) => {if(val < sliceThre) return acc + val; else return acc}, 0) / arr.length
const standardDeviation = function(arr) {
    var avg = average(arr)
    var sum = 0;
    var num = 0;
    arr.forEach((val)=>{
        if(val < sliceThre){
            sum += Math.pow(val - avg, 2)
            num++
        }
    })
    return Math.sqrt(sum/num) 
}

function flatten(arr) {
    while(arr.some(item=>Array.isArray(item))) {
        arr = [].concat(...arr);
    }
    return arr;
}

function getSizeDiff(rect1, rect2){
    return Math.abs(rect1.width - rect2.width) + Math.abs(rect1.height - rect2.height)
}

function getAreaMatchContour(contours, area){
    var minSizeDiff = 65535
    var index = -1;
    var matchIndex = 0;
    contours.forEach((contour)=>{
      index++;
      var diffSize = Math.abs(contour.area - area)
      if(diffSize < minSizeDiff){
        minSizeDiff = diffSize
        matchIndex = index
      }
    })

    console.log("area diff:" + minSizeDiff + ", match index:" + matchIndex)
    return matchIndex;
}

function getPerimeterMatchContour(contours, perimeter){
    var minSizeDiff = 65535
    var index = -1;
    var matchIndex = 0;
    contours.forEach((contour)=>{
      index++;
      var diffSize = Math.abs(contour.arcLength() - perimeter)
      if(diffSize < minSizeDiff){
        minSizeDiff = diffSize
        matchIndex = index
      }
    })

    console.log("perimeter diff:" + minSizeDiff + ", match index:" + matchIndex)
    return matchIndex;
}

function getRectMatchContour(contours, rect){
    var minSizeDiff = 65535
    var index = -1;
    var matchIndex = 0;
    contours.forEach((contour)=>{
      index++;
      var diffSize = getSizeDiff(rect, contour.boundingRect())
      if(diffSize < minSizeDiff){
        minSizeDiff = diffSize
        matchIndex = index
      }
    })

    console.log("Length diff:" + minSizeDiff + ", match index:" + matchIndex)
    return matchIndex
}

function getDistance(notchRect, matchRect){
    console.log("notch rect:" + JSON.stringify(notchRect))  
    console.log("match rect:" + JSON.stringify(matchRect))
    if(matchRect.width - notchRect.width > 10){
      return matchRect.x - notchRect.x
    }else{
      return Math.round(matchRect.x + 0.5 * matchRect.width - 0.5 * notchRect.width - notchRect.x)
    }
}

function getNotch(originPath, slicePath, bgPath){
    const originMat = cv.imread(originPath)
    cv.imwrite("./opencv_test/origin.jpg", originMat)

    const sliceMat = cv.imread(slicePath)
    const sliceGrayMat = sliceMat.bgrToGray()
    var sliceThreMat = sliceGrayMat.threshold(sliceThre, 255, cv.THRESH_BINARY)
    const sliceCannyMat = sliceThreMat.canny(50, 130)
    const sliceContours = sliceCannyMat.findContours(cv.RETR_EXTERNAL, cv.CHAIN_APPROX_NONE)
    const sliceSortedContours = sliceContours.sort((c0, c1)=> c1.area - c0.area)
    const notchArea = sliceSortedContours[0].area
    const notchPerimeter = sliceSortedContours[0].arcLength()
    const notchRect = sliceSortedContours[0].boundingRect()
    console.log("slice contour, area:" + notchArea + ", perimeter:" + notchPerimeter + ", rect:" + JSON.stringify(notchRect))
  
    var notchMat = sliceGrayMat.getRegion(new cv.Rect(0, notchRect.y, notchRect.width + 2 * notchRect.x, notchRect.height))
    var notchArr = notchMat.getDataAsArray()
    const notchAvg = average(flatten(notchArr))
    const notchStd = standardDeviation(flatten(notchArr))
    var notchThre = notchAvg;
    if(notchStd < 0.25 * notchAvg){
        notchThre -= notchStd
    }else if(notchStd > 0.75 * notchAvg){
        notchThre -= 0.25 * notchStd
    }
    console.log("average:" + notchAvg + ", standard deviation:" + notchStd + ", threshold:" + notchThre)


    cv.imwrite("./opencv_test/notch.jpg", notchMat)
    cv.imwrite("./opencv_test/slice.jpg", sliceMat)
    cv.imwrite("./opencv_test/slice_gray.jpg", sliceGrayMat)
    cv.imwrite("./opencv_test/slice_threshold.jpg", sliceThreMat)
    cv.imwrite("./opencv_test/slice_canny.jpg", sliceCannyMat)
    console.log("find slice, rect:" + JSON.stringify(notchRect))
  
    const bgMat = cv.imread(bgPath)
    var bgGrayMat = bgMat.bgrToGray()
    var matched = bgGrayMat.matchTemplate(notchMat, cv.TM_CCOEFF_NORMED);
    console.log(matched)

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
    console.log("match temple:" + x)

    var bgThreMat = bgGrayMat.threshold(notchThre, 255, cv.THRESH_BINARY)
    var bgCannyMat = bgThreMat.canny(50, 130)
    
    const bgContours = bgCannyMat.findContours(cv.RETR_EXTERNAL, cv.CHAIN_APPROX_NONE)
    var areaIndex = getAreaMatchContour(bgContours, notchArea)
    var perimeterIndex = getPerimeterMatchContour(bgContours, notchPerimeter)
    var rectIndex = getRectMatchContour(bgContours, notchRect) 
  
    var matchMat = new cv.Mat(originMat.rows, originMat.cols, cv.CV_8UC3)
    const blue = new cv.Vec(255, 0, 0)
    const green = new cv.Vec(0, 255, 0)
    const red = new cv.Vec(0, 0, 255)
    matchMat.drawContours([bgContours[areaIndex]], blue, {thickness: 3 })
    matchMat.drawContours([bgContours[perimeterIndex]], green, {thickness: 3 })
    matchMat.drawContours([bgContours[rectIndex]], red, {thickness: 3 })

    const slideDistance = getDistance(notchRect, bgContours[rectIndex].boundingRect())
    console.log("slide distance:" + slideDistance)

    cv.imwrite("./opencv_test/bg.jpg", bgMat)
    cv.imwrite("./opencv_test/bg_threshold.jpg", bgThreMat)
    cv.imwrite("./opencv_test/bg_gray.jpg", bgGrayMat)
    cv.imwrite("./opencv_test/bg_canny.jpg", bgCannyMat)
    cv.imwrite("./opencv_test/bg_match.jpg", matchMat)
}

var originPath = "./anjuke/origin.jpg"
var slicePath = "./anjuke/slice.jpg"
var bgPath = "./anjuke/bg.jpg"
getNotch(originPath, slicePath, bgPath)
 
module.exports = {
    getNotch
};

