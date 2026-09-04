import AppKit
import Foundation
import Security

private let service = "North12BReportUploadEmployeeId"
private let account = NSUserName()

private func showMessage(_ title: String, _ message: String, style: NSAlert.Style) {
    let alert = NSAlert()
    alert.messageText = title
    alert.informativeText = message
    alert.alertStyle = style
    alert.addButton(withTitle: "關閉")
    alert.runModal()
}

let app = NSApplication.shared
app.setActivationPolicy(.regular)
app.activate(ignoringOtherApps: true)

let prompt = NSAlert()
prompt.messageText = "北一二B 09:45 自動化憑證"
prompt.informativeText = "請輸入授權員編。內容不會顯示，也不會寫入 log、檔案、shell history 或 command line。"
prompt.alertStyle = .informational
prompt.addButton(withTitle: "儲存至 Login Keychain")
prompt.addButton(withTitle: "取消")

let field = NSSecureTextField(frame: NSRect(x: 0, y: 0, width: 320, height: 24))
field.placeholderString = "5–12 碼英數字"
prompt.accessoryView = field

guard prompt.runModal() == .alertFirstButtonReturn else {
    exit(2)
}

let identity = field.stringValue.trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
guard identity.range(of: "^[A-Z0-9]{5,12}$", options: .regularExpression) != nil else {
    showMessage("格式不正確", "請重新執行並輸入 5–12 碼英數字。", style: .critical)
    exit(78)
}

guard let data = identity.data(using: .utf8) else {
    showMessage("儲存失敗", "無法建立 Keychain 資料。", style: .critical)
    exit(1)
}

let query: [String: Any] = [
    kSecClass as String: kSecClassGenericPassword,
    kSecAttrService as String: service,
    kSecAttrAccount as String: account,
]
let update: [String: Any] = [kSecValueData as String: data]
var status = SecItemUpdate(query as CFDictionary, update as CFDictionary)
if status == errSecItemNotFound {
    var add = query
    add[kSecValueData as String] = data
    add[kSecAttrLabel as String] = "North12B report upload identity"
    add[kSecAttrDescription as String] = "Local 09:45 automation credential"
    status = SecItemAdd(add as CFDictionary, nil)
}

guard status == errSecSuccess else {
    showMessage("儲存失敗", "Login Keychain 回傳錯誤碼 \(status)。", style: .critical)
    exit(1)
}

showMessage("設定完成", "憑證已安全保存並完成格式驗證；實際值未顯示。", style: .informational)
