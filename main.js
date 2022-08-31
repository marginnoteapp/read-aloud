;(function () {
  const Addon = {
    name: "Read Aloud",
    key: "readaloud"
  }
  const colors = {
    Gray: "#414141",
    Default: "#FFFFFF",
    Dark: "#000000",
    Green: "#E9FBC7",
    Sepia: "#F5EFDC"
  }
  const zh = {
    confirm: "确定",
    cancel: "取消"
  }
  const en = {
    confirm: "OK",
    cancel: "Cancel"
  }
  const lang =
    NSLocale.preferredLanguages().length &&
    NSLocale.preferredLanguages()[0].startsWith("zh")
      ? zh
      : en
  const console = {
    log(obj) {
      JSB.log(`${Addon.key} %@`, obj)
    }
  }
  function NSValue2String(v) {
    return Database.transArrayToJSCompatible([v])[0]
  }
  function CGRectString2CGRect(s) {
    // {{116, 565}, {11, 15}}
    // {x,y}, {h,w}
    const arr = s.match(/\d+/g).map(k => Number(k))
    return {
      x: arr[0],
      y: arr[1],
      height: arr[2],
      width: arr[3]
    }
  }
  async function delay(sec) {
    return new Promise(resolve =>
      NSTimer.scheduledTimerWithTimeInterval(sec, false, resolve)
    )
  }
  async function setTimeInterval(sec, f) {
    const setTimer = async (sec, f, config) => {
      while (1) {
        if (config.stop) break
        f()
        await delay(sec)
      }
    }
    const config = {
      stop: false
    }
    setTimer(sec, f, config)
    return {
      invalidate: () => {
        config.stop = true
      }
    }
  }
  const SpearkerViewController = JSB.defineClass(
    "SpearkerViewController : UIViewController",
    {
      viewDidLoad() {
        function initButton(pos, text) {
          const frame = { ...pos, width: 50, height: 50 }
          const button = new UIButton(frame)
          button.setTitleForState(text, 0)
          button.addTargetActionForControlEvents(self, "clickButton:", 1 << 6)
          return button
        }

        self.view.addSubview(initButton({ x: 0, y: 0 }, "⏹"))
        self.view.addSubview(initButton({ x: 50, y: 0 }, "⏮"))
        self.view.addSubview(initButton({ x: 100, y: 0 }, "⏸︎"))
        self.view.addSubview(initButton({ x: 150, y: 0 }, "⏭"))

        self.view.layer.cornerRadius = 10
        self.view.layer.borderWidth = 2
        self.view.layer.borderColor = UIColor.colorWithHexString("#65819C")
        self.view.layer.cornerRadius = 10
      },
      viewWillAppear() {
        self.view.backgroundColor = UIColor.colorWithHexString(
          colors[Application.sharedInstance().currentTheme]
        )
      },
      clickButton(button) {
        const { text } = button.titleLabel
        // 有点坑，直接判断字符有点问题
        let status
        if (text.charCodeAt(0) === 9208) {
          status = "pause"
          button.setTitleForState("⏯", 0)
        } else if (text === "⏯") {
          status = "continue"
          button.setTitleForState("⏸", 0)
        } else
          status = {
            "⏭": "next",
            "⏮": "previous",
            "⏹": "stop"
          }[text]
        NSNotificationCenter.defaultCenter().postNotificationNameObjectUserInfo(
          "ReadAloudStatusChange",
          self,
          {
            status
          }
        )
      }
    },
    {}
  )
  JSB.newAddon = () => {
    function layoutViewController() {
      const studyController = Application.sharedInstance().studyController(
        self.window
      )
      const frame = studyController.view.bounds
      const width = 200
      function autoX() {
        const readerView = studyController.readerController.view
        const isHidden = readerView.hidden
        if (studyController.rightMapMode) {
          const x = (readerView.frame.width - width) / 2
          return x < 50 || isHidden ? 50 : x
        } else {
          const x = frame.width - (readerView.frame.width + width) / 2
          return x > frame.width - width - 50 || isHidden
            ? frame.width - width - 50
            : x
        }
      }
      self.speakerViewController.view.frame = {
        x: autoX(),
        y: frame.height - 150,
        width,
        height: 50
      }
    }
    function popup(title, message, buttons = [lang.confirm]) {
      return new Promise(resolve =>
        UIAlertView.showWithTitleMessageStyleCancelButtonTitleOtherButtonTitlesTapBlock(
          title,
          message,
          2,
          lang.cancel,
          buttons,
          (alert, buttonIndex) => {
            resolve({
              content: alert.textFieldAtIndex(0).text.trim(),
              option: buttonIndex - 1
            })
          }
        )
      )
    }
    function showHUD(text, duration = 2) {
      Application.sharedInstance().showHUD(text, self.window, duration)
    }
    function getPageContent(pageNo) {
      const { document } = self.documentController
      const data = document.textContentsForPageNo(pageNo)
      if (!data?.length) return
      return data
        .reduce((acc, cur) => {
          const line = cur.reduce((a, c) => {
            a += String.fromCharCode(Number(c.char))
            return a
          }, "")
          if (line) {
            const { y } = CGRectString2CGRect(NSValue2String(cur[0].rect))
            acc.push({
              y,
              line
            })
          }
          return acc
        }, [])
        .sort((a, b) => b.y - a.y)
        .map(k => k.line)
        .join(" ")
    }
    class Speaker {
      constructor() {
        this.s = SpeechManager.sharedInstance()
      }
      isSpeakOver() {
        console.log(this.s.speaking)
        return !this.s.speaking && this.status === "playing"
      }
      play(content) {
        this.s.playText(content)
        this.status = "playing"
      }
      pause() {
        this.s.pauseSpeech()
        this.status = "pause"
      }
      continue() {
        this.s.continueSpeech()
      }
      close() {
        this.s.stopSpeech()
      }
    }
    async function onToggle() {
      try {
        self.status = !self.status
        self.studyController.refreshAddonCommands()
        if (self.status) {
          layoutViewController()
          self.studyController.view.addSubview(self.speakerViewController.view)
          const { currPageNo } = self.documentController
          let pageNo = currPageNo
          self.speaker.play(
            "测试翻页测试翻页测试翻页测试翻页测试翻页测试翻页测试翻页"
          )
          self.timer = await setTimeInterval(1, () => {
            if (self.speaker.isSpeakOver()) {
              console.log("执行了几次")
              // self.speaker.play(getPageContent(pageNo + 1))
            }
          })
        } else {
          self.speakOver = undefined
          self.speakerViewController.view.removeFromSuperview()
          self.speaker.close()
          self.timer.invalidate()
        }
      } catch (e) {
        console.log(String(e))
      }
    }
    function jump(pageNo) {
      const documentController =
        self.studyController.readerController.currentDocumentController
      documentController.setPageAtIndex(
        documentController.indexFromPageNo(pageNo)
      )
    }

    return JSB.defineClass(
      Addon.name + ": JSExtension",
      {
        sceneWillConnect() {
          self.status = false
          self.app = Application.sharedInstance()
          self.studyController = self.app.studyController(self.window)
          self.speaker = new Speaker()
          self.speakerViewController = SpearkerViewController.new()
          self.documentController =
            self.studyController.readerController.currentDocumentController
        },
        notebookWillOpen() {
          NSNotificationCenter.defaultCenter().addObserverSelectorName(
            self,
            "onReadAloudStatusChange:",
            "ReadAloudStatusChange"
          )
        },
        notebookWillClose() {
          NSNotificationCenter.defaultCenter().removeObserverName(
            self,
            "ReadAloudStatusChange"
          )
        },
        documentDidOpen(docmd5) {
          self.docmd5 = docmd5
        },
        queryAddonCommandStatus() {
          return self.studyController.studyMode !== 3
            ? {
                image: "logo.png",
                object: self,
                selector: "onToggle:",
                checked: self.status
              }
            : null
        },
        controllerWillLayoutSubviews: function (controller) {
          if (
            controller ==
            Application.sharedInstance().studyController(self.window)
          ) {
            layoutViewController()
          }
        },
        onReadAloudStatusChange(sender) {
          if (
            !Application.sharedInstance().checkNotifySenderInWindow(
              sender,
              self.window
            )
          )
            return
          const { status } = sender.userInfo
          switch (status) {
            case "continue":
              self.speaker.continue()
              break
            case "pause":
              self.speaker.pause()
              break
            case "next": {
              const { currPageNo } = self.documentController
              let pageNo = currPageNo + 1
              const content = getPageContent(pageNo)
              if (content) {
                self.speaker.play(content)
                jump(pageNo)
              }
              break
            }
            case "previous": {
              const { currPageNo } = self.documentController
              let pageNo = currPageNo - 1
              const content = getPageContent(pageNo)
              if (content) {
                self.speaker.play(content)
                jump(pageNo)
              }
              break
            }
            case "stop":
              onToggle()
              break
          }
        },
        onToggle
      },
      {}
    )
  }
})()
