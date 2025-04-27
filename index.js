const readlineSync = require('readline-sync');
const fsa = require('fs/promises');
const axios = require('axios');

// Fungsi delay biasa
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Fungsi countdown
async function countdown(seconds, user, channelId) {
    for (let i = seconds; i > 0; i--) {
        process.stdout.write(`\r[User: ${user}] [Channel: ${channelId}] ⏳ Kirim berikutnya dalam ${i}s... `);
        await delay(1000);
    }
    process.stdout.write('\r'); // bersihkan baris
}

// Ambil slowmode per channel
async function getSlowModeDelay(token, channelId) {
    try {
        const res = await axios.get(`https://discord.com/api/v9/channels/${channelId}`, {
            headers: { Authorization: token }
        });
        const delay = res.data.rate_limit_per_user || 0;
        console.log(`ℹ️  [Channel: ${channelId}] Slow mode: ${delay}s`);
        return delay;
    } catch (err) {
        console.warn(`⚠️  [Channel: ${channelId}] Gagal ambil info slow mode, pakai default 5s`);
        return 5;
    }
}

// Kirim pesan
async function sendMessage(token, channelId, message) {
    try {
        await axios.post(
            `https://discord.com/api/v9/channels/${channelId}/messages`,
            { content: message },
            {
                headers: {
                    Authorization: token,
                    'Content-Type': 'application/json'
                }
            }
        );
        return 'success';
    } catch (error) {
        console.error(`❌ [Channel: ${channelId}] Gagal kirim pesan: ${message}`);
        if (error.response) console.error(`[Response]:`, error.response.data);
        return 'failed';
    }
}

// Looping per channel
async function runChannelLoop(token, channelId, messages, user) {
    while (true) {
        const delaySeconds = await getSlowModeDelay(token, channelId);
        const randomDelay = Math.floor(Math.random() * 10);
        // Menambahkan delay random untuk menghindari pola
        const finalDelay = delaySeconds + randomDelay;

        // Kirim setiap pesan satu per satu dari array 'messages'
        for (let message of messages) {
            const sendStatus = await sendMessage(token, channelId, message);
            console.log(`[User: ${user}] [Channel: ${channelId}] Chat: "${message}" [Send ${sendStatus}]`);

            // Tunggu selama finalDelay sebelum mengirim pesan berikutnya
            await countdown(finalDelay, user, channelId);
        }
    }
}


// Looping per token
async function runBotLoop(token, actions, user) {
    console.log(`🚀 Mulai bot looping untuk token: ${token.slice(0, 25)}...`);

    // Parallel per channel, tetapi sekarang chat adalah array, bukan string
    const allChannelLoops = actions.map(({ channel, chat }) =>
        runChannelLoop(token, channel, chat, user) // Kirim pesan satu per satu
    );

    await Promise.all(allChannelLoops); // Biarkan semua channel jalan bareng
}


// Fungsi untuk login dan ambil token
const getToken = (email, password) => new Promise((resolve, reject) => {
    axios.post('https://discord.com/api/v9/auth/login', {
        captcha_key: null,
        login: email,
        password: password,
        undelete: false,
        gift_code_sku_id: null
    })
        .then(res => resolve(res.data))
        .catch(err => reject(err));
});

// Start semua bot paralel
async function startAllBotsLooping() {
    try {
        const raw = await fsa.readFile('./data/data.json', 'utf-8');
        const { data } = JSON.parse(raw);

        // Parallel loop per token
        await Promise.all(
            data.map((bot) => runBotLoop(bot.token, bot.actions, bot.username)) // Gunakan bot.username, bukan user yang manual
        );
    } catch (err) {
        console.error("🔥 Gagal jalanin semua bot:", err.message);
    }
}

async function editData() {
    let finalData = { data: [] };

    // Baca file data.json
    try {
        const existing = await fsa.readFile("./data/data.json", "utf-8");
        const parsed = JSON.parse(existing);
        if (parsed && Array.isArray(parsed.data)) {
            finalData = parsed;
        } else {
            console.warn("⚠️ File JSON tidak valid, akan reset ke default.");
        }
    } catch (err) {
        console.warn("⚠️ Tidak bisa baca file data.json, akan buat baru.");
    }

    // Menampilkan daftar username
    const usernames = finalData.data.map((item) => item.username);
    const usernameChoice = readlineSync.keyInSelect(usernames, '[+] Pilih username yang ingin diedit:');

    if (usernameChoice === -1) {
        console.log("⚠️ Tidak ada username yang dipilih!");
        return;
    }

    const selectedUsername = finalData.data[usernameChoice];

    console.log(`\n[+] Menampilkan channel untuk username: ${selectedUsername.username}`);

    let editingChannel = true;
    while (editingChannel) {
        // Menampilkan daftar channel untuk username yang dipilih
        const channels = selectedUsername.actions.map((action) => action.nama || `Channel ${action.channel}`);
        const channelChoice = readlineSync.keyInSelect(
            [...channels, 'Tambah Channel', 'Simpan dan Kembali ke Menu Utama'],
            '[+] Pilih channel yang ingin diedit:'
        );

        if (channelChoice === -1) {
            console.log("⚠️ Tidak ada channel yang dipilih!");
            return;
        }

        if (channelChoice === channels.length) { // Pilih "Tambah Channel"
            const newChannelID = readlineSync.question('[+] Masukkan ID Channel baru: ').trim();
            const newChannelName = readlineSync.question('[+] Masukkan Nama Channel baru: ').trim();
            if (newChannelID && newChannelName) {
                selectedUsername.actions.push({
                    channel: newChannelID,
                    nama: newChannelName,
                    chat: [] // Channel baru dimulai tanpa chat
                });
                console.log("✅ Channel berhasil ditambahkan!");
            } else {
                console.log("⚠️ ID dan Nama Channel tidak boleh kosong!");
            }
        } else if (channelChoice === channels.length + 1) { // Pilih "Kembali ke Menu Utama"
            editingChannel = false;
        } else { // Edit Channel yang dipilih
            const selectedChannel = selectedUsername.actions[channelChoice];

            if (selectedChannel.chat.length === 0) {
                let tambahChatLagi = true;
                console.log("⚠️ Channel ini belum memiliki chat. tambahkan chat pertama!");

                while (tambahChatLagi) {
                    const newChat = readlineSync.question('[+] Masukkan pesan baru untuk channel: ').trim();
                    if (newChat) {
                        selectedChannel.chat.push(newChat);
                        console.log("✅ Chat berhasil ditambahkan!");

                        // Setelah sukses tambah, langsung tanya mau tambah lagi
                        const addMore = readlineSync.keyInYN('[+] Mau tambah chat lagi?');
                        tambahChatLagi = addMore; // kalau Y lanjut, kalau N berhenti
                    } else {
                        console.log("⚠️ Pesan tidak boleh kosong!");
                    }
                }
            } else {
                // Jika ada chat, tampilkan daftar chat dengan pilihan tambah atau hapus chat
                let editingChat = true;
                while (editingChat) {
                    console.log("\n[+] Daftar Chat:");
                    selectedChannel.chat.forEach((chat, index) => {
                        console.log(`[${index + 1}] ${chat}`);
                    });

                    // Menampilkan opsi untuk tambah chat, hapus chat, atau kembali
                    const chatChoice = readlineSync.question(
                        '[+] Pilih opsi: 999 untuk tambah chat, 000 untuk hapus chat, 0 untuk kembali: '
                    );

                    if (chatChoice === '0') { // Kembali ke Channel
                        editingChat = false;
                    } else if (chatChoice === '999') { // Tambah Chat
                        const newChat = readlineSync.question('[+] Masukkan pesan baru untuk channel: ').trim();
                        if (newChat) {
                            selectedChannel.chat.push(newChat);
                            console.log("✅ Chat berhasil ditambahkan!");
                        } else {
                            console.log("⚠️ Pesan tidak boleh kosong!");
                        }
                    } else if (chatChoice === '000') { // Hapus Chat
                        const chatToDelete = readlineSync.questionInt('[+] Masukkan nomor chat yang ingin dihapus: ');
                        if (chatToDelete > 0 && chatToDelete <= selectedChannel.chat.length) {
                            selectedChannel.chat.splice(chatToDelete - 1, 1);
                            console.log("✅ Chat berhasil dihapus!");
                        } else {
                            console.log("⚠️ Nomor chat tidak valid!");
                        }
                    } else {
                        console.log("⚠️ Pilihan tidak valid.");
                    }
                }
            }
        }
    }

    // Menyimpan data yang telah diubah
    await fsa.writeFile("./data/data.json", JSON.stringify(finalData, null, 2), "utf-8");
    console.log(`\n✅ Data berhasil diperbarui di /data/data.json`);
}

// Menu
async function mainMenu() {
    try {
        console.log("\n////////////////////////// ");
        console.log("// Badut Discord nodejs // ");
        console.log("////////////////////////// \n");

        console.log(`Silahkan pilih
1. Tambah token & aksi
2. Jalankan BOT (Looping)
3. Edit data
8. Exit\n`);

        const choice = readlineSync.question('[!] Pilihanmu: ');

        if (choice === "1") {
            const email = readlineSync.question('[+] Email: ');
            const password = readlineSync.question('[+] Password: ', { hideEchoBack: true });

            const ambiltoken = await getToken(email, password);

            if (ambiltoken?.token) {
                console.log(`\n[+] Token berhasil diambil: ${ambiltoken.token}`);

                const userLabel = readlineSync.question('[+] Masukkan nama untuk token ini (bebas, buat identifikasi): ').trim();

                const tokenObj = {
                    token: ambiltoken.token,
                    username: userLabel,
                    actions: []
                };

                let tambahLagi = true;

                while (tambahLagi) {
                    const channel = readlineSync.question('[+] Masukkan Channel ID: ').trim();
                    const namaChannel = readlineSync.question('[+] Masukkan Nama Channel: ').trim(); // Menambahkan input untuk nama channel
                    let chatMessages = [];

                    let tambahChat = true;
                    // Menambahkan chat sampai pengguna memilih untuk berhenti
                    while (tambahChat) {
                        const chat = readlineSync.question('[+] Masukkan Pesan: ').trim();

                        if (chat) {
                            chatMessages.push(chat);
                        } else {
                            console.log("⚠️ Pesan tidak boleh kosong!");
                        }

                        const lanjutChat = readlineSync.question('[?] Tambah pesan lagi untuk channel ini? (y/n): ');
                        tambahChat = lanjutChat.toLowerCase() === 'y';
                    }

                    if (channel && chatMessages.length > 0) {
                        tokenObj.actions.push({ channel, nama: namaChannel, chat: chatMessages });
                    } else {
                        console.log("⚠️ Channel dan pesan tidak boleh kosong!");
                    }

                    const lanjut = readlineSync.question('[?] Tambah channel lagi? (y/n): ');
                    tambahLagi = lanjut.toLowerCase() === 'y';
                }

                let finalData = { data: [] };
                try {
                    const existing = await fsa.readFile("./data/data.json", "utf-8");
                    const parsed = JSON.parse(existing);
                    if (parsed && Array.isArray(parsed.data)) {
                        finalData = parsed;
                    } else {
                        console.warn("⚠️ File JSON tidak valid, akan reset ke default.");
                    }
                } catch (err) {
                    console.warn("⚠️ Tidak bisa baca file data.json, akan buat baru.");
                }

                finalData.data.push(tokenObj);

                await fsa.writeFile("./data/data.json", JSON.stringify(finalData, null, 2), "utf-8");
                console.log(`\n✅ Data berhasil ditulis ke /data/data.json`);
            } else if (ambiltoken?.captcha_key?.includes('captcha-required')) {
                console.log("⚠️ Kamu harus login ke browser terlebih dahulu.");
            } else {
                console.log("❌ Terjadi error saat ambil token.");
            }

            // 🔁 Balik ke menu lagi
            return mainMenu();
        }

        if (choice === "2") {
            console.log("\n🚀 Menjalankan semua bot secara looping...");
            await startAllBotsLooping(); // Ini jalanin terus
        }
        
        if (choice === "3") {
            await editData();
            return mainMenu();
        }

        if (choice === "8") {
            console.log("Bye bye beb 😘");
            process.exit();
        }

    } catch (err) {
        console.error("🔥 Terjadi error:", err.message);
    }
}
mainMenu(); // mulaiin menu pertama kali

