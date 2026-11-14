export interface RobloxNpcConfig {
  npcName: string;
  gameName: string;
  genre: string;
  language: "id" | "en";
  welcomeText: string;
  gameKnowledge: string;
  endpointUrl: string;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function escapeLuauString(str: string): string {
  return str
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\r?\n/g, "\\n");
}

export function generateServerScriptSource(config: RobloxNpcConfig): string {
  const safeEndpoint = escapeLuauString(config.endpointUrl);
  const safeNpcName = escapeLuauString(config.npcName);
  const safeGameName = escapeLuauString(config.gameName);
  const safeGenre = escapeLuauString(config.genre);
  const safeKnowledge = escapeLuauString(config.gameKnowledge);
  const safeWelcome = escapeLuauString(config.welcomeText);

  return `-- RbxSight AI Pemandu (ServerScript)
-- Otomatis memindahkan RemoteEvent ke ReplicatedStorage dan UI ke StarterGui saat game dimulai.
local HttpService = game:GetService("HttpService")
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local StarterGui = game:GetService("StarterGui")

local PACKAGE_FOLDER = script.Parent
local API_URL = "${safeEndpoint}"
local NPC_NAME = "${safeNpcName}"
local GAME_NAME = "${safeGameName}"
local GAME_GENRE = "${safeGenre}"
local GAME_KNOWLEDGE = "${safeKnowledge}"
local WELCOME_TEXT = "${safeWelcome}"

-- Setup RemoteEvent di ReplicatedStorage
local remote = PACKAGE_FOLDER:FindFirstChild("PemanduChatRemote")
if not remote then
\tremote = Instance.new("RemoteEvent")
\tremote.Name = "PemanduChatRemote"
end
remote.Parent = ReplicatedStorage

-- Setup ScreenGui di StarterGui + pemain yang sudah join
local guiTemplate = PACKAGE_FOLDER:FindFirstChild("PemanduAIGui")
if guiTemplate then
\tguiTemplate.Parent = StarterGui
\tfor _, player in ipairs(Players:GetPlayers()) do
\t\tlocal playerGui = player:FindFirstChildOfClass("PlayerGui")
\t\tif playerGui and not playerGui:FindFirstChild("PemanduAIGui") then
\t\t\tguiTemplate:Clone().Parent = playerGui
\t\tend
\tend
end

-- Hubungkan ProximityPrompt pada NPC
local npcModel = PACKAGE_FOLDER:FindFirstChild("NPC_Pemandu")
if npcModel then
\tlocal prompt = npcModel:FindFirstChildWhichIsA("ProximityPrompt", true)
\tif prompt then
\t\tprompt.Triggered:Connect(function(player)
\t\t\tremote:FireClient(player, "open", {
\t\t\t\tnpcName = NPC_NAME,
\t\t\t\twelcome = WELCOME_TEXT,
\t\t\t})
\t\tend)
\tend
end

-- Jawaban cadangan lokal jika HttpService belum aktif di Game Settings
local function getLocalFallbackAnswer(question: string): string
\tlocal q = string.lower(question)
\tif string.find(q, "halo") or string.find(q, "hai") or string.find(q, "hi") then
\t\treturn "Halo! Saya " .. NPC_NAME .. ", pemandu di " .. GAME_NAME .. ". Ada yang bisa kubantu soal cara bermain?"
\tend
\tif string.find(q, "cara") or string.find(q, "main") or string.find(q, "kontrol") then
\t\tif GAME_KNOWLEDGE ~= "" then
\t\t\treturn "Panduan " .. GAME_NAME .. ": " .. GAME_KNOWLEDGE
\t\tend
\t\treturn "Jelajahi area utama, ikuti penanda misi, dan kumpulkan poin atau koin untuk membuka area baru!"
\tend
\tif GAME_KNOWLEDGE ~= "" then
\t\treturn "Info " .. GAME_NAME .. ": " .. GAME_KNOWLEDGE .. " (Tips: Aktifkan Allow HTTP Requests di Game Settings agar AI penuh aktif)"
\tend
\treturn "Saya siap membantu! Aktifkan Allow HTTP Requests di Game Settings > Security agar saya bisa menjawab pertanyaan bebas dengan Gemini AI."
end

local lastRequestTime: { [number]: number } = {}

remote.OnServerEvent:Connect(function(player, action, payload)
\tif action ~= "ask" or typeof(payload) ~= "string" then
\t\treturn
\tend

\tlocal question = string.sub(payload, 1, 240)
\tlocal now = os.clock()
\tif lastRequestTime[player.UserId] and (now - lastRequestTime[player.UserId]) < 1.5 then
\t\tremote:FireClient(player, "reply", "Tunggu sebentar sebelum mengirim pertanyaan berikutnya.")
\t\treturn
\tend
\tlastRequestTime[player.UserId] = now

\tlocal ok, responseBody = pcall(function()
\t\tlocal bodyJson = HttpService:JSONEncode({
\t\t\tmessage = question,
\t\t\tplayerName = player.Name,
\t\t\tnpcName = NPC_NAME,
\t\t\tgameName = GAME_NAME,
\t\t\tgenre = GAME_GENRE,
\t\t\tgameContext = GAME_KNOWLEDGE,
\t\t\tlanguage = "${config.language}",
\t\t})
\t\treturn HttpService:PostAsync(API_URL, bodyJson, Enum.HttpContentType.ApplicationJson, false)
\tend)

\tif ok and typeof(responseBody) == "string" then
\t\tlocal decodeOk, data = pcall(function()
\t\t\treturn HttpService:JSONDecode(responseBody)
\t\tend)
\t\tif decodeOk and typeof(data) == "table" and typeof(data.reply) == "string" then
\t\t\tremote:FireClient(player, "reply", data.reply)
\t\t\treturn
\t\tend
\tend

\t-- Fallback otomatis jika HTTP Requests belum diaktifkan
\tremote:FireClient(player, "reply", getLocalFallbackAnswer(question))
end)
`;
}

export function generateClientLocalScriptSource(config: RobloxNpcConfig): string {
  const safeNpcName = escapeLuauString(config.npcName);
  const safeWelcome = escapeLuauString(config.welcomeText);

  return `-- RbxSight AI Pemandu (LocalScript di dalam StarterGui > PemanduAIGui)
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local player = Players.LocalPlayer
local gui = script.Parent
local remote = ReplicatedStorage:WaitForChild("PemanduChatRemote", 15) :: RemoteEvent?

-- Bangun UI Chat Pemandu secara otomatis
gui.ResetOnSpawn = false

local openBtn = Instance.new("TextButton")
openBtn.Name = "ToggleButton"
openBtn.Size = UDim2.fromOffset(156, 40)
openBtn.Position = UDim2.new(1, -172, 1, -56)
openBtn.BackgroundColor3 = Color3.fromRGB(0, 162, 255)
openBtn.TextColor3 = Color3.fromRGB(6, 16, 27)
openBtn.Font = Enum.Font.GothamBold
openBtn.TextSize = 14
openBtn.Text = "Tanya ${safeNpcName}"
openBtn.Parent = gui

local btnCorner = Instance.new("UICorner")
btnCorner.CornerRadius = UDim.new(0, 8)
btnCorner.Parent = openBtn

local panel = Instance.new("Frame")
panel.Name = "ChatPanel"
panel.Size = UDim2.fromOffset(360, 420)
panel.Position = UDim2.new(1, -376, 1, -486)
panel.BackgroundColor3 = Color3.fromRGB(18, 23, 34)
panel.Visible = false
panel.Parent = gui

local panelCorner = Instance.new("UICorner")
panelCorner.CornerRadius = UDim.new(0, 12)
panelCorner.Parent = panel

local stroke = Instance.new("UIStroke")
stroke.Color = Color3.fromRGB(48, 60, 82)
stroke.Thickness = 1
stroke.Parent = panel

local header = Instance.new("TextLabel")
header.Size = UDim2.new(1, -44, 0, 42)
header.Position = UDim2.fromOffset(14, 0)
header.BackgroundTransparency = 1
header.Text = "${safeNpcName}"
header.TextColor3 = Color3.fromRGB(241, 245, 249)
header.Font = Enum.Font.GothamBold
header.TextSize = 15
header.TextXAlignment = Enum.TextXAlignment.Left
header.Parent = panel

local closeBtn = Instance.new("TextButton")
closeBtn.Size = UDim2.fromOffset(32, 32)
closeBtn.Position = UDim2.new(1, -38, 0, 5)
closeBtn.BackgroundTransparency = 1
closeBtn.Text = "X"
closeBtn.TextColor3 = Color3.fromRGB(148, 163, 184)
closeBtn.Font = Enum.Font.GothamBold
closeBtn.TextSize = 14
closeBtn.Parent = panel

local scroll = Instance.new("ScrollingFrame")
scroll.Size = UDim2.new(1, -24, 1, -112)
scroll.Position = UDim2.fromOffset(12, 46)
scroll.BackgroundColor3 = Color3.fromRGB(11, 14, 20)
scroll.BorderSizePixel = 0
scroll.CanvasSize = UDim2.new(0, 0, 0, 0)
scroll.AutomaticCanvasSize = Enum.AutomaticSize.Y
scroll.ScrollBarThickness = 4
scroll.Parent = panel

local scrollPad = Instance.new("UIPadding")
scrollPad.PaddingTop = UDim.new(0, 8)
scrollPad.PaddingBottom = UDim.new(0, 8)
scrollPad.PaddingLeft = UDim.new(0, 8)
scrollPad.PaddingRight = UDim.new(0, 8)
scrollPad.Parent = scroll

local listLayout = Instance.new("UIListLayout")
listLayout.Padding = UDim.new(0, 8)
listLayout.SortOrder = Enum.SortOrder.LayoutOrder
listLayout.Parent = scroll

local inputBox = Instance.new("TextBox")
inputBox.Size = UDim2.new(1, -96, 0, 38)
inputBox.Position = UDim2.new(0, 12, 1, -50)
inputBox.BackgroundColor3 = Color3.fromRGB(9, 12, 18)
inputBox.TextColor3 = Color3.fromRGB(241, 245, 249)
inputBox.PlaceholderText = "Tanya cara main atau misi..."
inputBox.PlaceholderColor3 = Color3.fromRGB(100, 116, 139)
inputBox.Font = Enum.Font.Gotham
inputBox.TextSize = 13
inputBox.Text = ""
inputBox.ClearTextOnFocus = false
inputBox.Parent = panel

local inputCorner = Instance.new("UICorner")
inputCorner.CornerRadius = UDim.new(0, 8)
inputCorner.Parent = inputBox

local sendBtn = Instance.new("TextButton")
sendBtn.Size = UDim2.fromOffset(68, 38)
sendBtn.Position = UDim2.new(1, -80, 1, -50)
sendBtn.BackgroundColor3 = Color3.fromRGB(0, 162, 255)
sendBtn.TextColor3 = Color3.fromRGB(6, 16, 27)
sendBtn.Font = Enum.Font.GothamBold
sendBtn.TextSize = 13
sendBtn.Text = "Kirim"
sendBtn.Parent = panel

local sendCorner = Instance.new("UICorner")
sendCorner.CornerRadius = UDim.new(0, 8)
sendCorner.Parent = sendBtn

local function addMessage(sender: string, text: string, isBot: boolean)
\tlocal msgLabel = Instance.new("TextLabel")
\tmsgLabel.Size = UDim2.new(1, 0, 0, 0)
\tmsgLabel.AutomaticSize = Enum.AutomaticSize.Y
\tmsgLabel.BackgroundColor3 = if isBot then Color3.fromRGB(22, 29, 43) else Color3.fromRGB(13, 36, 59)
\tmsgLabel.TextColor3 = Color3.fromRGB(241, 245, 249)
\tmsgLabel.Font = Enum.Font.Gotham
\tmsgLabel.TextSize = 13
\tmsgLabel.TextWrapped = true
\tmsgLabel.TextXAlignment = Enum.TextXAlignment.Left
\tmsgLabel.Text = sender .. ": " .. text
\tmsgLabel.Parent = scroll

\tlocal pad = Instance.new("UIPadding")
\tpad.PaddingTop = UDim.new(0, 6)
\tpad.PaddingBottom = UDim.new(0, 6)
\tpad.PaddingLeft = UDim.new(0, 8)
\tpad.PaddingRight = UDim.new(0, 8)
\tpad.Parent = msgLabel

\tlocal corner = Instance.new("UICorner")
\tcorner.CornerRadius = UDim.new(0, 6)
\tcorner.Parent = msgLabel

\ttask.defer(function()
\t\tscroll.CanvasPosition = Vector2.new(0, scroll.AbsoluteCanvasSize.Y)
\tend)
end

addMessage("${safeNpcName}", "${safeWelcome}", true)

local function sendQuestion()
\tlocal text = inputBox.Text
\tif string.gsub(text, "%s+", "") == "" then
\t\treturn
\tend
\tinputBox.Text = ""
\taddMessage(player.DisplayName, text, false)
\tif remote then
\t\tremote:FireServer("ask", text)
\telse
\t\taddMessage("${safeNpcName}", "Koneksi server pemandu belum siap.", true)
\tend
end

openBtn.MouseButton1Click:Connect(function()
\tpanel.Visible = not panel.Visible
end)

closeBtn.MouseButton1Click:Connect(function()
\tpanel.Visible = false
end)

sendBtn.MouseButton1Click:Connect(sendQuestion)
inputBox.FocusLost:Connect(function(enterPressed)
\tif enterPressed then
\t\tsendQuestion()
\tend
end)

if remote then
\tremote.OnClientEvent:Connect(function(eventType, data)
\t\tif eventType == "open" then
\t\t\tpanel.Visible = true
\t\telseif eventType == "reply" and typeof(data) == "string" then
\t\t\taddMessage("${safeNpcName}", data, true)
\t\tend
\tend)
end
`;
}

export function generateRbxmxXml(config: RobloxNpcConfig): string {
  const serverSource = escapeXml(generateServerScriptSource(config));
  const localSource = escapeXml(generateClientLocalScriptSource(config));
  const safeNpcName = escapeXml(config.npcName);

  return `<roblox xmlns:xmime="http://www.w3.org/2005/05/xmlmime" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="http://www.roblox.com/roblox.xsd" version="4">
\t<External>null</External>
\t<External>nil</External>
\t<Item class="Folder" referent="RBX001">
\t\t<Properties>
\t\t\t<string name="Name">RbxSight_AIPemandu</string>
\t\t</Properties>
\t\t<Item class="Script" referent="RBX002">
\t\t\t<Properties>
\t\t\t\t<string name="Name">PemanduServerScript</string>
\t\t\t\t<ProtectedString name="Source"><![CDATA[${generateServerScriptSource(config).replace(/\]\]>/g, "]]]]><![CDATA[>")}]]></ProtectedString>
\t\t\t</Properties>
\t\t</Item>
\t\t<Item class="RemoteEvent" referent="RBX003">
\t\t\t<Properties>
\t\t\t\t<string name="Name">PemanduChatRemote</string>
\t\t\t</Properties>
\t\t</Item>
\t\t<Item class="ScreenGui" referent="RBX004">
\t\t\t<Properties>
\t\t\t\t<string name="Name">PemanduAIGui</string>
\t\t\t\t<bool name="ResetOnSpawn">false</bool>
\t\t\t</Properties>
\t\t\t<Item class="LocalScript" referent="RBX005">
\t\t\t\t<Properties>
\t\t\t\t\t<string name="Name">PemanduClientUI</string>
\t\t\t\t\t<ProtectedString name="Source"><![CDATA[${generateClientLocalScriptSource(config).replace(/\]\]>/g, "]]]]><![CDATA[>")}]]></ProtectedString>
\t\t\t\t</Properties>
\t\t\t</Item>
\t\t</Item>
\t\t<Item class="Model" referent="RBX006">
\t\t\t<Properties>
\t\t\t\t<string name="Name">NPC_Pemandu</string>
\t\t\t\t<token name="LevelOfDetail">0</token>
\t\t\t\t<CoordinateFrame name="ModelInPrimary">
\t\t\t\t\t<X>0</X><Y>0</Y><Z>0</Z>
\t\t\t\t\t<R00>1</R00><R01>0</R01><R02>0</R02>
\t\t\t\t\t<R10>0</R10><R11>1</R11><R12>0</R12>
\t\t\t\t\t<R20>0</R20><R21>0</R21><R22>1</R22>
\t\t\t\t</CoordinateFrame>
\t\t\t\t<Ref name="PrimaryPart">RBX007</Ref>
\t\t\t</Properties>
\t\t\t<Item class="Part" referent="RBX007">
\t\t\t\t<Properties>
\t\t\t\t\t<string name="Name">Body</string>
\t\t\t\t\t<bool name="Anchored">true</bool>
\t\t\t\t\t<CoordinateFrame name="CFrame">
\t\t\t\t\t\t<X>0</X><Y>3</Y><Z>0</Z>
\t\t\t\t\t\t<R00>1</R00><R01>0</R01><R02>0</R02>
\t\t\t\t\t\t<R10>0</R10><R11>1</R11><R12>0</R12>
\t\t\t\t\t\t<R20>0</R20><R21>0</R21><R22>1</R22>
\t\t\t\t\t</CoordinateFrame>
\t\t\t\t\t<Color3uint8 name="Color3uint8">4278231807</Color3uint8>
\t\t\t\t\t<token name="Material">288</token>
\t\t\t\t\t<Vector3 name="size">
\t\t\t\t\t\t<X>3</X><Y>5</Y><Z>2</Z>
\t\t\t\t\t</Vector3>
\t\t\t\t</Properties>
\t\t\t\t<Item class="ProximityPrompt" referent="RBX008">
\t\t\t\t\t<Properties>
\t\t\t\t\t\t<string name="Name">TanyaPrompt</string>
\t\t\t\t\t\t<string name="ActionText">Tanya ${safeNpcName}</string>
\t\t\t\t\t\t<string name="ObjectText">Pemandu AI</string>
\t\t\t\t\t\t<float name="MaxActivationDistance">12</float>
\t\t\t\t\t</Properties>
\t\t\t\t</Item>
\t\t\t\t<Item class="BillboardGui" referent="RBX009">
\t\t\t\t\t<Properties>
\t\t\t\t\t\t<string name="Name">LabelGui</string>
\t\t\t\t\t\t<bool name="AlwaysOnTop">true</bool>
\t\t\t\t\t\t<UDim2 name="Size">
\t\t\t\t\t\t\t<XS>0</XS><XO>180</XO><YS>0</YS><YO>46</YO>
\t\t\t\t\t\t</UDim2>
\t\t\t\t\t\t<Vector3 name="StudsOffset">
\t\t\t\t\t\t\t<X>0</X><Y>3.6</Y><Z>0</Z>
\t\t\t\t\t\t</Vector3>
\t\t\t\t\t</Properties>
\t\t\t\t\t<Item class="TextLabel" referent="RBX010">
\t\t\t\t\t\t<Properties>
\t\t\t\t\t\t\t<string name="Name">Title</string>
\t\t\t\t\t\t\t<float name="BackgroundTransparency">0.2</float>
\t\t\t\t\t\t\t<Color3uint8 name="BackgroundColor3">4278915860</Color3uint8>
\t\t\t\t\t\t\t<Color3uint8 name="TextColor3">4294967295</Color3uint8>
\t\t\t\t\t\t\t<string name="Text">${safeNpcName}</string>
\t\t\t\t\t\t\t<bool name="TextScaled">true</bool>
\t\t\t\t\t\t\t<UDim2 name="Size">
\t\t\t\t\t\t\t\t<XS>1</XS><XO>0</XO><YS>1</YS><YO>0</YO>
\t\t\t\t\t\t\t</UDim2>
\t\t\t\t\t\t</Properties>
\t\t\t\t\t</Item>
\t\t\t\t</Item>
\t\t\t</Item>
\t\t</Item>
\t</Item>
</roblox>`;

  void serverSource;
  void localSource;
}
