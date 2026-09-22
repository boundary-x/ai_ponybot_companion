// AI Ponybot Companion: receiver for M+40+40-40-40T300 + newline.
// Add the bluetooth and github:boundary-x/ai_ponybot_basic extensions.
// Motor 1 = right front, 2 = right rear, 3 = left rear, 4 = left front.
let 받은문자 = ""
let 멈출시간 = 0
let 움직이는중 = false
let 모터1속도 = 0
let 모터2속도 = 0
let 모터3속도 = 0
let 모터4속도 = 0
let 동작시간 = 0

function 정지 () {
    aiPonybot.stopAllMotors()
    움직이는중 = false
    멈출시간 = 0
}

// Check every character before parsing. Partial or malformed commands stop the robot.
function 숫자확인 (문자: string) {
    return 문자.length == 1 && "0123456789".indexOf(문자) >= 0
}

function 명령확인 () {
    if (받은문자.length != 17 || 받은문자.charAt(0) != "M" || 받은문자.charAt(13) != "T") {
        return false
    }
    for (let 위치 = 1; 위치 <= 10; 위치 += 3) {
        if (받은문자.charAt(위치) != "+" && 받은문자.charAt(위치) != "-") {
            return false
        }
        if (!(숫자확인(받은문자.charAt(위치 + 1))) || !(숫자확인(받은문자.charAt(위치 + 2)))) {
            return false
        }
    }
    for (let 위치 = 14; 위치 <= 16; 위치++) {
        if (!(숫자확인(받은문자.charAt(위치)))) {
            return false
        }
    }
    return true
}

function 모터움직이기 (번호: number, 속도: number) {
    // Web speed is a percentage. Ponybot motor blocks use 0..255.
    let 모터출력 = Math.round(Math.abs(속도) * 255 / 100)
    if (속도 >= 0) {
        aiPonybot.runMotor(번호, aiPonybot.Direction.Clockwise, 모터출력)
    } else {
        aiPonybot.runMotor(번호, aiPonybot.Direction.CounterClockwise, 모터출력)
    }
}

bluetooth.onBluetoothConnected(function () {
    정지()
})
bluetooth.onBluetoothDisconnected(function () {
    정지()
})
bluetooth.onUartDataReceived(serial.delimiters(Delimiters.NewLine), function () {
    받은문자 = bluetooth.uartReadUntil(serial.delimiters(Delimiters.NewLine))
    if (받은문자 == "S") {
        정지()
    } else if (명령확인()) {
        모터1속도 = parseFloat(받은문자.substr(1, 3))
        모터2속도 = parseFloat(받은문자.substr(4, 3))
        모터3속도 = parseFloat(받은문자.substr(7, 3))
        모터4속도 = parseFloat(받은문자.substr(10, 3))
        동작시간 = parseFloat(받은문자.substr(14, 3))
        if (Math.abs(모터1속도) <= 80 && Math.abs(모터2속도) <= 80 && Math.abs(모터3속도) <= 80 && Math.abs(모터4속도) <= 80 && 동작시간 >= 50 && 동작시간 <= 600) {
            멈출시간 = input.runningTime() + 동작시간
            움직이는중 = true
            모터움직이기(1, 모터1속도)
            모터움직이기(2, 모터2속도)
            모터움직이기(3, 모터3속도)
            모터움직이기(4, 모터4속도)
        } else {
            정지()
        }
    } else {
        정지()
    }
})

aiPonybot.runNormal(aiPonybot.DirectionControl.Forward, 0)
정지()
bluetooth.startUartService()
basic.forever(function () {
    if (움직이는중 && input.runningTime() >= 멈출시간) {
        정지()
    }
    basic.pause(20)
})
