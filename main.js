/**
 * MIT License
 * Copyright (c) 2022 MarginNote
 * Github: https://github.com/marginnoteapp/readaloud
 * Welcom to contribute to this project!
 */

try {
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
    cancel: "取消",
    no_text: "该 PDF 可能是扫描版本，无法获取到文字，无法朗读",
    first_page: "已经是第一页了",
    finished: "。本书朗读完毕",
    insert_page: "此页为插入页，不支持朗读",
    last_page: "已经是最后一页了",
    auto_next_page_no_text:
      "这是新的一页，但是该页没有文字或者无法获取到文字，继续翻页。",
    new_page_no_text: "该页没有文字或者无法获取到文字，自动翻页。"
  }
  const en = {
    confirm: "OK",
    cancel: "Cancel",
    finished: ". This book is finished",
    insert_page: "This page is an inserted page and cannot be read aloud",
    first_page: "It's already the first page.",
    last_page: "It's already the last page",
    no_text:
      "This PDF may be a scanned version, and the text cannot be obtained, so it cannot be read aloud",
    auto_next_page_no_text:
      "This is new page. But there is no text or the text cannot be obtained on this page. Continue to next page.",
    new_page_no_text:
      "There is no text or the text cannot be obtained on this page. Go to next page."
  }
  const lang =
    NSLocale.preferredLanguages().length &&
    NSLocale.preferredLanguages()[0].startsWith("zh")
      ? zh
      : en
  const console = {
    log(obj, suffix = "normal") {
      JSB.log(`${Addon.key}-${suffix} %@`, obj)
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
        if (f instanceof Promise) {
          await f()
        } else f()
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
  function initButton(pos, text) {
    const frame = { ...pos, width: 50, height: 50 }
    const button = new UIButton(frame)
    button.setTitleForState(text, 0)
    button.addTargetActionForControlEvents(self, "clickButton:", 1 << 6)
    return button
  }

  const SpearkerViewController = JSB.defineClass(
    "SpearkerViewController : UIViewController",
    {
      viewDidLoad() {
        self.view.layer.cornerRadius = 10
        self.view.layer.borderWidth = 2
        self.view.layer.borderColor = UIColor.colorWithHexString("#65819C")
        self.view.layer.cornerRadius = 10
        self.view.addSubview(initButton({ x: 0, y: 0 }, "⏹"))
        self.view.addSubview(initButton({ x: 100, y: 0 }, "⏮"))
        self.view.addSubview(initButton({ x: 150, y: 0 }, "⏭"))
      },
      viewWillAppear() {
        self.view.addSubview(initButton({ x: 50, y: 0 }, "⏯"))
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
            "⏭": "nextPage",
            "⏪": "prevLine",
            "⏩": "nextLine",
            "⏮": "prevPage",
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
      const { studyController } = self
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
        .trim()
    }
    class Speaker {
      constructor() {
        this.s = SpeechManager.sharedInstance()
        this.speakerStatus = "stop"
      }
      get status() {
        if (Date.now() - this.lastPlay < 300) return "playing"
        if (this.speakerStatus === "playing" && !this.s.sysSpeaking)
          return "over"
        return this.speakerStatus
      }
      play(content) {
        this.s.playText(content)
        this.lastPlay = Date.now()
        this.speakerStatus = "playing"
      }
      pause() {
        this.s.pauseSpeech()
        this.speakerStatus = "pause"
      }
      continue() {
        this.s.continueSpeech()
        this.lastPlay = Date.now()
        this.speakerStatus = "playing"
      }
      close() {
        this.s.stopSpeech()
        this.speakerStatus = "stop"
      }
    }

    function closeAll() {
      if (self.status) {
        self.status = false
        self.studyController.refreshAddonCommands()
        self.speakerViewController.view.removeFromSuperview()
        if (self.speaker.status !== "stop") {
          self.timer.invalidate()
          self.speaker.close()
        }
      }
    }
    async function openAll() {
      if (!self.status) {
        if (
          self.studyController.studyMode <= 1 ||
          (self.studyController.studyMode === 2 &&
            !self.studyController.readerController.view.hidden)
        ) {
          const { currPageNo } = self.documentController
          if (isAdded(currPageNo)) {
            showHUD(lang.insert_page, 2)
            return
          }
          const content = getPageContent(currPageNo)
          if (!content) {
            showHUD(lang.no_text, 2)
            return
          }
          self.status = true
          self.studyController.refreshAddonCommands()
          self.studyController.view.addSubview(self.speakerViewController.view)
          layoutViewController()
        }
      }
    }
    function jump(pageNo) {
      const index = self.documentController.indexFromPageNo(pageNo)
      self.documentController.setPageAtIndex(index)
    }
    function isDeleted(pageNo, index) {
      index = index ?? self.documentController.indexFromPageNo(pageNo)
      return index === 0 && pageNo !== 1
    }
    function isAdded(pageNo) {
      return pageNo > 10000
    }
    function isLastPage(pageNo) {
      return pageNo === self.documentController.document.pageCount
    }
    function isFirstPage(pageNo) {
      return pageNo === 1
    }
    function nextPage(pageNo) {
      do {
        if (isLastPage(pageNo)) return false
        pageNo++
      } while (isDeleted(pageNo))
      return pageNo
    }
    function prevPage(pageNo) {
      do {
        if (isFirstPage(pageNo)) return false
        pageNo--
      } while (isDeleted(pageNo))
      return pageNo
    }
    return JSB.defineClass(
      Addon.name + ": JSExtension",
      {
        sceneWillConnect() {
          self.status = false
          self.pageNo = 0
          self.app = Application.sharedInstance()
          self.studyController = self.app.studyController(self.window)
          self.speaker = new Speaker()
          self.speakerViewController = SpearkerViewController.new()
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
          self.documentController =
            self.studyController.readerController.currentDocumentController
        },
        documentWillClose() {
          closeAll()
        },
        queryAddonCommandStatus() {
          return self.studyController.studyMode !== 3
            ? {
                image: "logo_44x44.png",
                object: self,
                selector: "onToggle:",
                checked: self.status
              }
            : null
        },
        controllerWillLayoutSubviews(controller) {
          if (
            controller ==
            Application.sharedInstance().studyController(self.window)
          ) {
            layoutViewController()
          }
        },
        async onReadAloudStatusChange(sender) {
          if (
            !Application.sharedInstance().checkNotifySenderInWindow(
              sender,
              self.window
            )
          )
            return
          const { status } = sender.userInfo
          switch (status) {
            case "continue": {
              if (self.speaker.status === "stop") {
                const { currPageNo } = self.documentController
                if (isAdded(currPageNo)) {
                  showHUD(lang.insert_page, 2)
                  closeAll()
                  return
                }
                const content = getPageContent(currPageNo)
                if (!content) {
                  showHUD(lang.no_text, 2)
                  closeAll()
                  return
                }
                // self.speaker.play("测试翻页测试翻页测试翻页测试翻")
                self.pageNo = currPageNo
                self.speaker.play(content)
                // sysSpeaking value delay 1s
                self.timer = await setTimeInterval(0.5, () => {
                  try {
                    if (self.speaker.status === "over") {
                      const pageNo = nextPage(self.pageNo)
                      if (pageNo === false) {
                        closeAll()
                        return
                      } else {
                        self.pageNo = pageNo
                        const content = getPageContent(self.pageNo)
                        jump(self.pageNo)
                        const overText =
                          nextPage(self.pageNo) === false ? lang.finished : ""
                        self.speaker.play(
                          (content ? content : lang.auto_next_page_no_text) +
                            overText
                        )
                      }
                    }
                    // else if (self.speaker.status === "pause") {
                    //   console.log("暂停")
                    // } else {
                    //   console.log("正在播放")
                    // }
                  } catch (err) {
                    console.log(String(err))
                  }
                })
              } else self.speaker.continue()
              break
            }
            case "pause":
              self.speaker.pause()
              break
            case "nextPage": {
              if (self.speaker.status === "stop") return
              const pageNo = nextPage(self.pageNo)
              if (pageNo === false) {
                showHUD(lang.last_page, 2)
              } else {
                self.pageNo = pageNo
                jump(self.pageNo)
                const content = getPageContent(self.pageNo)
                self.speaker.play(content ? content : lang.new_page_no_text)
              }
              break
            }
            case "prevPage": {
              if (self.speaker.status === "stop") return
              const pageNo = prevPage(self.pageNo)
              if (pageNo === false) {
                showHUD(lang.first_page, 2)
              } else {
                self.pageNo = pageNo
                jump(self.pageNo)
                const content = getPageContent(self.pageNo)
                self.speaker.play(content ? content : lang.new_page_no_text)
              }
              break
            }
            case "stop":
              closeAll()
              break
          }
        },
        async onToggle() {
          try {
            if (self.status) {
              closeAll()
            } else {
              await openAll()
            }
          } catch (e) {
            console.log(String(e))
          }
        }
      },
      {}
    )
  }
} catch (err) {
  JSB.log(`readaloud-error %@`, String(err))
}
