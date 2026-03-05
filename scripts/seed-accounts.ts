/**
 * Bulk seed accounts to the buzzer API.
 * Usage: npx tsx scripts/seed-accounts.ts <API_BASE_URL>
 * Example: npx tsx scripts/seed-accounts.ts https://uningested-paulene-unpoeticised.ngrok-free.dev
 */

const API_BASE = process.argv[2] || 'http://localhost:3000';

// Mapping: profile_name -> { tiktok_username, gologin_profile_id }
const accounts = [
    // === macOS profiles ===
    { name: "MasOS_1", username: "rafliansyahhhh76", gologin_id: "6973289dcb10ee8f0a237b8c" },
    { name: "MasOS_2", username: "dimaasaryoo78", gologin_id: "69745505aa2fdfe3e6841117" },
    { name: "MasOS_3", username: "faajarratamaaa75", gologin_id: "6974551ec026dc9488f80de3" },
    { name: "MasOS_4", username: "naufalriskyyy", gologin_id: "69745537cd6eb2613b736512" },
    { name: "MasOS_5", username: "angelfaniii_", gologin_id: "697455c4083a78ce96eaf4e0" },
    { name: "MasOS_6", username: "friskaa_puttt", gologin_id: "697455eb14d7a53bde3c2d8c" },
    { name: "MasOS_7", username: "putriayuu8049", gologin_id: "6974599d14d7a53bde3d5d08" },
    { name: "MasOS_8", username: "nidaseptii", gologin_id: "697459c71934d25ab4ffb8b2" },
    { name: "MasOS_9", username: "arininputri", gologin_id: "697459e1604657530bf885a2" },
    { name: "MasOS_10", username: "putr.aiqbal78", gologin_id: "69748a92083a78ce96114581" },
    { name: "MasOS_11", username: "arkasyahputra83", gologin_id: "69a55ecaa6991a994183b7f8" },
    { name: "MasOS_12", username: "aasprakoso", gologin_id: "69a55f48b529a942d4e81d3d" },
    { name: "MasOS_13", username: "wiradanuuu", gologin_id: "69a55f73b529a942d4e81d57" },
    { name: "MasOS_14", username: "angelshadira", gologin_id: "69a55f73b529a942d4e81d59" },
    { name: "MasOS_15", username: "dwir.atnaaaaaa", gologin_id: "69a55f785c460c69ef9708f6" },
    { name: "MasOS_16", username: "roniaditya09", gologin_id: "69a55f785c460c69ef9708f8" },
    { name: "MasOS_17", username: "rezarahasia", gologin_id: "69a55f785c460c69ef9708fc" },
    { name: "MasOS_18", username: "nicholassapuu", gologin_id: "69a55f785c460c69ef9708fa" },
    { name: "MasOS_19", username: "pevitaporsi", gologin_id: "69a55fd25c460c69ef970953" },
    { name: "MasOS_20", username: "aurelhermotor", gologin_id: "69a55fd25c460c69ef970955" },
    { name: "MasOS_21", username: "putrimarahh", gologin_id: "69a55fd25c460c69ef970959" },
    { name: "MasOS_22", username: "chicojeruk", gologin_id: "69a55fd25c460c69ef970957" },
    { name: "MasOS_23", username: "chelseaiklan", gologin_id: "69a55fd25c460c69ef97095d" },
    { name: "MasOS_24", username: "elrumiitt", gologin_id: "69a55fd25c460c69ef97095b" },
    { name: "MasOS_25", username: "teukuwishlist", gologin_id: "69a55fd25c460c69ef970961" },
    { name: "MasOS_26", username: "riodewasaa", gologin_id: "69a55fd25c460c69ef97095f" },
    { name: "MasOS_27", username: "audi.markisa", gologin_id: "69a56075b529a942d4e81fa8" },
    { name: "MasOS_28", username: "ajilsani", gologin_id: "69a56075b529a942d4e81fa6" },
    { name: "MasOS_29", username: "roniaditya09", gologin_id: "69a56075b529a942d4e81fac" },
    { name: "MasOS_30", username: "rizkyysapuutrraa", gologin_id: "69a56075b529a942d4e81fb5" },

    // === Windows profiles ===
    { name: "Windows_1", username: "aditpharsa", gologin_id: "69a11defbd73e8be7defa857" },
    { name: "Windows_2", username: "iqbalbaguus", gologin_id: "69a11fa84c125a55c26e5adf" },
    { name: "Windows_3", username: "kenzieadimara", gologin_id: "69a12042dd01df81b2131804" },
    { name: "Windows_4", username: "putrinauura", gologin_id: "69a1329d993b075fa9111d2b" },
    { name: "Windows_5", username: "cherylagness", gologin_id: "69a1329d993b075fa9111d2d" },
    { name: "Windows_6", username: "gitajannahh", gologin_id: "69a1329d993b075fa9111d2f" },
    { name: "Windows_7", username: "putririitta", gologin_id: "69a1337fdd01df81b2133762" },
    { name: "Windows_8", username: "renyedelyn", gologin_id: "69a1337fdd01df81b2133768" },
    { name: "Windows_9", username: "budipuuttra", gologin_id: "69a1337fdd01df81b213376a" },
    { name: "Windows_10", username: "renimuktti", gologin_id: "69a1337fdd01df81b213376e" },
];

async function seedAccounts() {
    const url = `${API_BASE}/api/v1/accounts`;
    let success = 0;
    let failed = 0;

    console.log(`\n🚀 Seeding ${accounts.length} accounts to ${url}\n`);

    for (const acc of accounts) {
        const payload = {
            tiktok_username: acc.username,
            browser_provider: "gologin",
            gologin_profile_id: acc.gologin_id,
        };

        try {
            const res = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'ngrok-skip-browser-warning': 'true',
                    'x-api-key': 'spectre-secret-key',
                },
                body: JSON.stringify(payload),
            });

            const text = await res.text();
            let data: any;
            try {
                data = JSON.parse(text);
            } catch {
                console.log(`❌ [${acc.name}] ${acc.username} -> Non-JSON response: ${text.substring(0, 200)}`);
                failed++;
                continue;
            }

            if (res.ok && data.success) {
                console.log(`✅ [${acc.name}] ${acc.username} -> ID: ${data.data.id}`);
                success++;
            } else {
                console.log(`❌ [${acc.name}] ${acc.username} -> Error: ${typeof data.error === 'string' ? data.error : JSON.stringify(data)}`);
                failed++;
            }
        } catch (err: any) {
            console.log(`❌ [${acc.name}] ${acc.username} -> Network error: ${err.message}`);
            failed++;
        }
    }

    console.log(`\n📊 Done! Success: ${success}, Failed: ${failed}, Total: ${accounts.length}\n`);
}

seedAccounts();
