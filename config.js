const firebaseConfig = {
apiKey: "AIzaSyDjhsXh2BKiULb_lf1XLXsQy6IRJP3paa4",
            authDomain: "gameui1z.firebaseapp.com",
            projectId: "gameui1z",
            storageBucket: "gameui1z.firebasestorage.app",
            messagingSenderId: "488163230363",
            appId: "1:488163230363:web:97b72324e07f428447fc3e",
            measurementId: "G-Z917M9T98P"
        };

        const LauncherConfig = Object.freeze({
            searchDebounceMs: 200,
            searchResultsLimit: 12,
            searchPromptText: 'Type to search...',
            pinnedGameOrder: ['store', 'explore', 'psplus'],
            avatarFallbackLabel: 'Player',
            wheelCooldownMin: 40,
            wheelCooldownBase: 260,
            wheelSensitivityStep: 22,
            clockOptions: { hour: 'numeric', minute: '2-digit', second: '2-digit' }
        });

        const LauncherState = {
            searchDebounceTimer: null,
            activeConversationId: null,
            lastConversationMessageKey: new Map(),
            clockInterval: null,
            dynamicCatalogRequest: null,
            launchScreenTimer: null,
            networkBannerTimer: null,
            toastActiveCount: 0,
            toastMaxVisible: 4,
            toastQueue: []
        };

        const AVATAR_FALLBACK_CACHE = new Map();
        const SUPPORT_TICKET_COOLDOWN_MS = 60000;

        const USERNAME_BLACKLIST = new Set(['beans']);

        function isUsernameForbidden(name) {
            return USERNAME_BLACKLIST.has(String(name || '').trim().toLowerCase());
        }

        async function enforceDeviceBanWall() {
            const overlay = document.getElementById('device-ban-overlay');
            if (!overlay) return;
            const fp = getDeviceFingerprint();
            if (localStorage.getItem('launcher_device_banned') === fp) {
                overlay.classList.remove('hidden');
                return;
            }
            if (!db) return;
            try {
                const snap = await db.collection('deviceBans').doc(fp).get();
                if (snap.exists) {
                    localStorage.setItem('launcher_device_banned', fp);
                    overlay.classList.remove('hidden');
                } else if (localStorage.getItem('launcher_device_banned')) {
                    localStorage.removeItem('launcher_device_banned');
                }
            } catch (e) {
                console.warn('Device ban check failed', e);
            }
        }

        function buildAvatarFallbackDataUri(label = LauncherConfig.avatarFallbackLabel) {
            const safeLabel = String(label || LauncherConfig.avatarFallbackLabel).trim() || LauncherConfig.avatarFallbackLabel;
            const initials = safeLabel.split(/\s+/).slice(0, 2).map(part => part[0]?.toUpperCase() || '').join('') || 'P';
            if (AVATAR_FALLBACK_CACHE.has(initials)) {
                return AVATAR_FALLBACK_CACHE.get(initials);
            }
            const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#1f2937"/><stop offset="1" stop-color="#0f172a"/></linearGradient></defs><rect width="96" height="96" rx="48" fill="url(#g)"/><circle cx="48" cy="36" r="18" fill="#f8fafc" fill-opacity="0.96"/><path d="M20 78c5-15 16-23 28-23s23 8 28 23" fill="#f8fafc" fill-opacity="0.96"/><text x="48" y="88" text-anchor="middle" font-family="Inter,Arial,sans-serif" font-size="12" font-weight="700" fill="#93c5fd">${initials}</text></svg>`;
            const dataUri = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
            AVATAR_FALLBACK_CACHE.set(initials, dataUri);
            return dataUri;
        }

        function handleAvatarFallback(img, label) {
            if (!img) return;
            img.onerror = null;
            img.src = buildAvatarFallbackDataUri(label || img.alt || img.dataset.seed || LauncherConfig.avatarFallbackLabel);
        }

function escapeHtml(value = '') {
            return String(value)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
        }

        function chunkArray(items = [], size = 10) {
            const chunks = [];
            for (let index = 0; index < items.length; index += size) {
                chunks.push(items.slice(index, index + size));
            }
            return chunks;
        }

        function normalizeSupportType(value) {
            const type = String(value || '').trim().toLowerCase();
            return ['bug', 'not-working', 'suggestion', 'other'].includes(type) ? type : 'other';
        }

        function buildMemberRemovalPatch(memberId) {
            return {
                memberIds: firebase.firestore.FieldValue.arrayRemove(memberId),
                [`names.${memberId}`]: firebase.firestore.FieldValue.delete(),
                [`avatars.${memberId}`]: firebase.firestore.FieldValue.delete(),
                [`typing.${memberId}`]: firebase.firestore.FieldValue.delete(),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            };
        }

const rawGameData = [
            { id:'store', type:'games', title:'PlayStation Store', icon:'<i class="fas fa-shopping-bag text-5xl text-blue-400"></i>', url:'https://forms.gle/DxkgjsxPiQ5VHnap9', bg:'https://images.unsplash.com/photo-1612287230202-1ff1d85d1bdf?q=80&w=1920', desc:'Request games through this Google Form.' },
            { id:'explore', type:'games', title:'Explore', icon:'<i class="fas fa-rocket text-5xl text-white"></i>', url:'https://blog.playstation.com/', bg:'https://images.unsplash.com/photo-1451187580459-43490279c0fa?q=80&w=1920', desc:'Discover news, trailers, and community highlights across PS5.' },
            { id:'baby-sniper', type:'games', title:'Baby Sniper In Vietnam', url:'https://drank-was-here.b-cdn.net/games/Baby-Sniper-In-Vietnam/index.html', desc:'A surreal sniper shooter starring young Minh in wartime missions.', bg:'https://images.unsplash.com/photo-1511512578047-dfb367046420?q=80&w=1920', placeholder:'BðŸ…±ï¸ ' },
            { id:'bacon-may-die', type:'games', title:'Bacon May Die', url:'https://s.gameszur.com/gamehub/bacon-may-die/', desc:'Punch, shoot, and survive waves as a furious pig brawler.', bg:'https://images.unsplash.com/photo-1511512578047-dfb367046420?q=80&w=1920', placeholder:'BaðŸ…±ï¸ ' },
            { id:'baseball-bros', type:'games', title:'Baseball Bros', url:'https://nealfun.app/game/baseball-bros/', desc:'Fast arcade baseball with huge swings, steals, and chaos.', bg:'https://images.unsplash.com/photo-1511512578047-dfb367046420?q=80&w=1920', placeholder:'BasðŸ…±ï¸ ' },
            { id:'basket-bros', type:'games', title:'Basket Bros', url:'https://basketbros-unblocked.github.io/a7/basket-bros/', desc:'Arcade one-on-one basketball packed with dunks and blocks.', bg:'https://images.unsplash.com/photo-1511512578047-dfb367046420?q=80&w=1920', placeholder:'BatðŸ…±ï¸ ' },
            { id:'bitlife', type:'games', title:'BitLife', url:'https://theunblock3dlabs.github.io/sourced/play/bitlife/', desc:'A life simulator where every choice shapes your character\'s story.', bg:'https://images.unsplash.com/photo-1511512578047-dfb367046420?q=80&w=1920', placeholder:'BiðŸ…±ï¸ ' },
            { id:'bloons-td5', type:'games', title:'Bloons TD5', url:'https://mgg658.github.io/zbtd5.html', desc:'Build monkey towers and pop massive balloon rushes.', bg:'https://images.unsplash.com/photo-1511512578047-dfb367046420?q=80&w=1920', placeholder:'BlðŸ…±ï¸ ' },
            { id:'bottle-flip-3d', type:'games', title:'Bottle Flip 3D', url:'https://55gms.com/misc/BottleFlip3D/index.html', desc:'Land trick flips across moving rooms and obstacle courses.', bg:'https://images.unsplash.com/photo-1511512578047-dfb367046420?q=80&w=1920', placeholder:'BoðŸ…±ï¸ ' },
            { id:'brawl-stars-sim', type:'games', title:'Brawl Stars Sim', url:'https://millanirbytes.frhumannet.com/cdn/games/brawl-simulator-3d/', desc:'A fan-made arena fighter with Brawl Stars-style battles.', bg:'https://images.unsplash.com/photo-1511512578047-dfb367046420?q=80&w=1920', placeholder:'BrðŸ…±ï¸ ' },
            { id:'brotato', type:'games', title:'Brotato', url:'https://learning.trogiang.vn/games/brotato2/index.html', desc:'Fight alien swarms as a weapon-stacking potato survivor.', bg:'https://images.unsplash.com/photo-1511512578047-dfb367046420?q=80&w=1920', placeholder:'BroðŸ…±ï¸ ' },
            { id:'burrito-bison', type:'games', title:'Burrito Bison Launcha Libre', url:'https://html-classic.itch.zone/html/7437859/index.html', desc:'Launch, bounce, and smash through gummy armies for distance.', bg:'https://images.unsplash.com/photo-1511512578047-dfb367046420?q=80&w=1920', placeholder:'BuðŸ…±ï¸ ' },
            { id:'cloverpit', type:'games', title:'Cloverpit', url:'https://cdn.jsdelivr.net/gh/web-ports/clover-pit@main/', desc:'A roguelite slot-machine nightmare where every spin pays debt.', bg:'https://images.unsplash.com/photo-1511512578047-dfb367046420?q=80&w=1920', placeholder:'CðŸ †' },
            { id:'cod-zombies', type:'games', title:'Cod Zombies', url:'https://nzp.gay/', desc:'A browser zombie survival shooter inspired by COD rounds.', bg:'https://imgcdn.dev/i/YRKfut', placeholder:'CoðŸ †' },
            { id:'cookie-clicker', type:'games', title:'Cookie Clicker', url:'https://orcatech2711.github.io/nano/games/cookieclicker/index.html', desc:'Bake absurd amounts of cookies with endless upgrades.', bg:'https://images.unsplash.com/photo-1511512578047-dfb367046420?q=80&w=1920', placeholder:'CooðŸ †' },
            { id:'deadshot', type:'games', title:'DeadShot', url:'https://deadshot.io/', desc:'A competitive online FPS built around aim and movement.', bg:'https://images.unsplash.com/photo-1511512578047-dfb367046420?q=80&w=1920', placeholder:'DðŸŽ¯' },
            { id:'drive-mad', type:'games', title:'Drive Mad', url:'https://cdn.jsdelivr.net/gh/genizy/dmad-poki@49b5ab6b987f5f3be58f9dae59c92e8fc1aab9b0/', desc:'Balance a shaky vehicle through brutal physics stunt tracks.', bg:'https://images.unsplash.com/photo-1511512578047-dfb367046420?q=80&w=1920', placeholder:'DrðŸŽ¯' },
            { id:'down-town-james-brown', type:'games', title:'Down Town James Brown', url:'https://cdn.jsdelivr.net/gh/bubbls/ugs-singlefile@main/AASINGLEFILE.html', desc:'A weird, fast arcade experiment driven by pure reactions.', bg:'https://img.icons8.com/color/1200/controller.jpg', placeholder:'DoðŸŽ¯' },
            { id:'flappy-bird', type:'games', title:'Flappy Bird', url:'https://flappybird.io/', desc:'Thread a tiny bird through pipes with ruthless timing.', bg:'https://images.unsplash.com/photo-1511512578047-dfb367046420?q=80&w=1920', placeholder:'Fâš½' },
            { id:'fnaf-world', type:'games', title:'FNAF (Five Nights At Freddy\'s) World', url:'https://irv77.github.io/hd_fnaf/w/', desc:'A colorful RPG spin-off with party battles and weird worlds.', bg:'https://images.unsplash.com/photo-1511512578047-dfb367046420?q=80&w=1920', placeholder:'FNâš½' },
            { id:'fnaf-pizza-simulator', type:'games', title:'FNAF Pizza Simulator', url:'https://irv77.github.io/hd_fnaf/ps/', desc:'Run a pizzeria by day and face horror after dark.', bg:'https://images.unsplash.com/photo-1511512578047-dfb367046420?q=80&w=1920', placeholder:'FNPâš½' },
            { id:'fnaf-sister-location', type:'games', title:'FNAF Sister Location', url:'https://irv77.github.io/hd_fnaf/sl/', desc:'A tense sci-fi horror ride inside a dangerous facility.', bg:'https://images.unsplash.com/photo-1511512578047-dfb367046420?q=80&w=1920', placeholder:'FNSâš½' },
            { id:'five-nights-ultimate-custom-night', type:'games', title:'Five Nights At Freddy\'s Ultimate Custom Night', url:'https://irv77.github.io/hd_fnaf/ucn/', desc:'Customize every animatronic threat in one brutal night.', bg:'https://images.unsplash.com/photo-1511512578047-dfb367046420?q=80&w=1920', placeholder:'FNNâš½' },
            { id:'football-bros', type:'games', title:'Football Bros', url:'https://script.google.com/macros/s/AKfycbxjYzXDX0iopyVPSDgG8_sTlQPpjv5KYMdsOtLXzYrQYdHPmHdswUb5NTXedQ3RK8XyoQ/exec', desc:'Arcade football with hard tackles, quick passes, and touchdowns.', bg:'https://images.unsplash.com/photo-1511512578047-dfb367046420?q=80&w=1920', placeholder:'Foâš½' },
            { id:'geometry-dash', type:'games', title:'Geometry Dash', url:'https://rawcdn.githack.com/genizy/google-class/main/gdlite/', desc:'Dash, jump, and fly through rhythm-synced obstacle chaos.', bg:'https://images.unsplash.com/photo-1511512578047-dfb367046420?q=80&w=1920', placeholder:'GðŸŽ®' },
            { id:'gladihoppers', type:'games', title:'Gladihoppers', url:'https://classroomjq.github.io/gladihoppers/', desc:'A funny 2D physics gladiator game with hopping arena fights.', bg:'https://images.unsplash.com/photo-1511512578047-dfb367046420?q=80&w=1920', placeholder:'GlaðŸŽ®' },
            { id:'granny', type:'games', title:'Granny', url:'https://cdn.jsdelivr.net/gh/gru6nny/ohd@main/sdk.js', desc:'Sneak through a locked house and escape before Granny catches you.', bg:'https://images.unsplash.com/photo-1511512578047-dfb367046420?q=80&w=1920', placeholder:'GraðŸŽ®' },
            { id:'iron-snout', type:'games', title:'Iron Snout', url:'https://classroom8.github.io/iron-snout/', desc:'A nonstop brawler where one pig counters endless wolves.', bg:'https://images.unsplash.com/photo-1511512578047-dfb367046420?q=80&w=1920', placeholder:'IðŸŽ²' },
            { id:'karate-bros', type:'games', title:'Karate Bros', url:'https://karatebros.io/', desc:'A quick martial arts brawler built around timing and combos.', bg:'https://geodashlite.io/data/image/game/karate-bros.jpg', placeholder:'KðŸ €' },
            { id:'kart-bros', type:'games', title:'Kart Bros', url:'https://kart-bros.io/kart-bros.embed', desc:'Kart racing chaos with drifts, shortcuts, and cartoon collisions.', bg:'https://images.unsplash.com/photo-1511512578047-dfb367046420?q=80&w=1920', placeholder:'KarðŸ €' },
            { id:'melon-sandbox', type:'games', title:'Melon Sandbox', url:'https://playhop.com/dist-app/260481?header=no&skip-guard=1&utm_source=parent_window_api&utm_medium=playgama&flags={%22adv_types_disabled%22:16}', desc:'A ragdoll sandbox for absurd experiments, traps, and explosions.', bg:'https://images.unsplash.com/photo-1511512578047-dfb367046420?q=80&w=1920', placeholder:'MðŸŽª' },
            { id:'nefarius', type:'games', title:'Nefarius', url:'https://isolated.ungrounded.net/alternate/5859000/5859157_alternate_271251_r3.zip/?NewgroundsAPI_PublisherID=1&NewgroundsAPI_SandboxID=69d84dd11198e&NewgroundsAPI_SessionID=&NewgroundsAPI_UserName=%26lt%3Bdeleted%26gt%3B&NewgroundsAPI_UserID=0&ng_username=%26lt%3Bdeleted%26gt%3B', desc:'A pixel-art wizard shooter about blasting slimes and reclaiming magic.', bg:'https://imgcdn.dev/i/YRKRqw', placeholder:'NðŸ ´' },
            { id:'retro-bowl', type:'games', title:'Retro-Bowl', url:'https://cdn.jsdelivr.net/gh/genizy/assets@main/retro-bowl/', desc:'Retro football management mixed with addictive on-field drives.', bg:'https://images.unsplash.com/photo-1511512578047-dfb367046420?q=80&w=1920', placeholder:'RðŸš€' },
            { id:'rocket-league', type:'games', title:'Rocket League', url:'https://rocketgoal.io/', desc:'Rocket-powered car soccer with boosts, aerials, and sharp rotations.', bg:'https://images.unsplash.com/photo-1511512578047-dfb367046420?q=80&w=1920', placeholder:'RoðŸš€' },
            { id:'rouge-souls-1', type:'games', title:'Rouge Souls 1', url:'https://script.google.com/macros/s/AKfycbz6wsJGGaRbc_voawFifLikzf38X3m3bFN_apBYsw3WZlzCpRwcCK3Q6Q4kAWsZ10BH7Q/exec', desc:'A side-scrolling rogue action run full of loot and danger.', bg:'https://images.unsplash.com/photo-1511512578047-dfb367046420?q=80&w=1920', placeholder:'RouðŸš€' },
            { id:'rouge-souls-2', type:'games', title:'Rouge Souls 2', url:'https://script.google.com/macros/s/AKfycbya2jmrLYgSkmRh3LXqH0bdWSvxuUbyQikOxtPU9v0A8WUFAeatt7Fwy0AOvzeHJwhT/exec', desc:'A tougher sequel with faster combat and bigger loot runs.', bg:'https://images.unsplash.com/photo-1511512578047-dfb367046420?q=80&w=1920', placeholder:'Rou2ðŸš€' },
            { id:'scritchy-scratchy', type:'games', title:'Scritchy Scratchy', url:'https://itch.io/embed-upload/16388344?color=333333', desc:'A scratch-card incremental game built around satisfying reveals.', bg:'https://images.unsplash.com/photo-1511512578047-dfb367046420?q=80&w=1920', placeholder:'SðŸ …' },
            { id:'shell-shockers', type:'games', title:'Shell Shockers', url:'https://d.clever.com.drmarcells.com/equations/shellshock/', desc:'An online egg shooter with guns, classes, and arena firefights.', bg:'https://images.unsplash.com/photo-1511512578047-dfb367046420?q=80&w=1920', placeholder:'ShðŸ …' },
            { id:'slime-rancher', type:'games', title:'Slime Rancher', url:'https://cdn.jsdelivr.net/gh/web-ports/slime-ranchers@main/', desc:'Collect bouncing slimes, feed them, and grow a strange ranch.', bg:'https://images.unsplash.com/photo-1511512578047-dfb367046420?q=80&w=1920', placeholder:'SlðŸ …' },
            { id:'slither-io', type:'games', title:'Slither.IO', url:'https://strongdog.com/real-slither.io/index.html', desc:'Grow your snake, trap rivals, and dominate the arena.', bg:'https://images.unsplash.com/photo-1511512578047-dfb367046420?q=80&w=1920', placeholder:'SliðŸ …' },
            { id:'snow-rider-3d', type:'games', title:'Snow-Rider3D', url:'https://itsvijaysingh.github.io/Snow-Rider3D/', desc:'Race downhill on a sled through trees, ramps, and hazards.', bg:'https://images.unsplash.com/photo-1511512578047-dfb367046420?q=80&w=1920', placeholder:'SnðŸ …' },
            { id:'snowball-io', type:'games', title:'Snowball.IO', url:'https://snowball-io.io/', desc:'Roll giant snowballs and knock rivals off the platform.', bg:'https://images.unsplash.com/photo-1511512578047-dfb367046420?q=80&w=1920', placeholder:'SnoðŸ …' },
            { id:'soccer-bros', type:'games', title:'Soccer Bros', url:'https://soccerbros.gg/', desc:'Arcade soccer with volleys, tackles, and over-the-top matches.', bg:'https://images.unsplash.com/photo-1511512578047-dfb367046420?q=80&w=1920', placeholder:'SocðŸ …' },
            { id:'subway-surfers', type:'games', title:'Subway Surfers', url:'https://pizzaedition.win/assets/allgames/subwaysurfers/index.html', desc:'Sprint through train yards, dodge hazards, and chase scores.', bg:'https://images.unsplash.com/photo-1511512578047-dfb367046420?q=80&w=1920', placeholder:'SuðŸ …' },
            { id:'survivor-io', type:'games', title:'Survivor.IO', url:'https://html5.gamedistribution.com/rvvASMiM/f1c451e586c04b4c8cba01b0c50d9090/index.html?gd_sdk_referrer_url=https%3A%2F%2Fwww.miniplay.com%2Fgame%2Fsurvivor-io&mp_api_as3_url=https%3A%2F%2Fssl.minijuegosgratis.com%2Flechuck%2Fas3%2Flatest.swf&mp_api_as3_url_bck=https%3A%2F%2Fapi.minijuegos.com%2Flechuck%2Fclient-as%2F&mp_api_id=5418&mp_api_js_url=https%3A%2F%2Fssl.minijuegosgratis.com%2Flechuck%2Fjs%2Flatest.js&mp_api_js_url_bck=https%3A%2F%2Fapi.minijuegos.com%2Flechuck%2Fclient-js%2F&mp_assets=https%3A%2F%2Fs2.minijuegosgratis.com%2F&mp_embed=0&mp_game_id=243226&mp_game_uid=survivor-io&mp_game_url=https%3A%2F%2Fwww.miniplay.com%2Fgame%2Fsurvivor-io&mp_int=1&mp_locale=en_US&mp_player_type=IFRAME&mp_site_https_url=https%3A%2F%2Fwww.miniplay.com%2F&mp_site_name=miniplay.com&mp_site_url=https%3A%2F%2Fwww.miniplay.com%2F&mp_timezone=America%2FChicago&mp_view_type=&mini_signature=5c1dd14bd056dfdc48b7d97ef3f2d3c2&xdm_e=https%3A%2F%2Fwww.miniplay.com&xdm_c=default1415&xdm_p=1&gd_zone_config=eyJwYXJlbnRVUkwiOiJodHRwczovL3d3dy5taW5pcGxheS5jb20vZ2FtZS9zdXJ2aXZvci1pbyIsInBhcmVudERvbWFpbiI6Im1pbmlwbGF5LmNvbSIsInRvcERvbWFpbiI6Im1pbmlwbGF5LmNvbSIsImhhc0ltcHJlc3Npb24iOmZhbHNlLCJsb2FkZXJFbmFibGVkIjp0cnVlLCJob3N0IjoiaHRtbDUuZ2FtZWRpc3RyaWJ1dGlvbi5jb20iLCJ2ZXJzaW9uIjoiMS41LjE4In0%253D', desc:'Mow down monster hordes with evolving auto-fire weapons.', bg:'https://images.unsplash.com/photo-1511512578047-dfb367046420?q=80&w=1920', placeholder:'SurðŸ …' },
            { id:'swords-and-souls', type:'games', title:'Swords And Souls', url:'https://script.google.com/macros/s/AKfycbwpk3_eQ-NLDyEjcqWn-txMpuRmeF2pgck1awpz9tkMNL79tQ_hYiqC3hKdWhXXXK1f1g/exec', desc:'Train your hero in minigames, then battle fantasy monsters.', bg:'https://images.unsplash.com/photo-1511512578047-dfb367046420?q=80&w=1920', placeholder:'SwðŸ …' },
            { id:'terraria', type:'games', title:'Terraria', url:'https://terrariamods-scratch.github.io/TerrariaStamped/embed/', desc:'Dig, build, craft, and fight through a massive 2D world.', bg:'https://images.unsplash.com/photo-1511512578047-dfb367046420?q=80&w=1920', placeholder:'TðŸ †' },
            { id:'the-binding-of-isaac-demo', type:'games', title:'The Binding of Isaac: Demo', url:'https://uploads.ungrounded.net/ruffle_wrapper/ruffleembed.html?v=1.2.3&browsermode=default&props=%7B%22ruffle%22%3A%22%2Fruffle_wrapper%2Flib%2Fruffle.js%3F1775708382%22%2C%22public_path%22%3A%22%2Fruffle_wrapper%2Flib%2F%22%2C%22swf%22%3A%22https%3A%2F%2Fuploads.ungrounded.net%2F581000%2F581168_Isaac_demo_Secure.swf%3F1318109425%22%2C%22vars%22%3A%7B%22NewgroundsAPI_PublisherID%22%3A1%2C%22NewgroundsAPI_SandboxID%22%3A%2269d96f699a6dc%22%2C%22NewgroundsAPI_SessionID%22%3A%22%22%2C%22NewgroundsAPI_UserName%22%3A%22%26lt%3Bdeleted%26gt%3B%22%2C%22NewgroundsAPI_UserID%22%3A0%2C%22ng_username%22%3A%22%26lt%3Bdeleted%26gt%3B%22%7D%2C%22width%22%3A800%2C%22height%22%3A600%2C%22icon%22%3A%22https%3A%2F%2Fpicon.ngfiles.com%2F581000%2Fflash_581168_card.webp%3Ff1669677110%22%2C%22warnOnUnsupportedContent%22%3Afalse%2C%22external%22%3A%22%2Fruffle_wrapper%2Fexternal%2Fruffle-external-input.js%3F1775831699%22%2C%22externalSettings%22%3A%7B%22endpoint%22%3A%22https%3A%2F%2Fwww.newgrounds.com%2Fportal%2Fruffle-options%2F197907%22%2C%22types%22%3A%5B1%5D%7D%7D', desc:'The original roguelike crawl through grotesque rooms and loot.', bg:'https://images.unsplash.com/photo-1511512578047-dfb367046420?q=80&w=1920', placeholder:'ThðŸ †' },
            { id:'the-binding-of-isaac-rebirth', type:'games', title:'The Binding of Isaac: Rebirth', url:'https://learning.trogiang.vn/games/psp/tboir/index.html', desc:'A faster Isaac run packed with wild item synergies.', bg:'https://images.unsplash.com/photo-1511512578047-dfb367046420?q=80&w=1920', placeholder:'ThrðŸ †' },
            { id:'the-binding-of-isaac-wrath-of-the-lamb', type:'games', title:'The Binding of Isaac: Wrath of The Lamb', url:'https://script.google.com/macros/s/AKfycbx1-ahIchbUqDQdqB5GJ2-ZxlbPLz1lz7ohzlqUZ41JUrAnGTIPjgLaASGqqV1ToAuZ/exec', desc:'The classic Isaac expansion with more bosses and items.', bg:'https://imgcdn.dev/i/YRKZiL', placeholder:'ThwðŸ †' },
            { id:'the-binding-of-isaac-wrath-eternal', type:'games', title:'The Binding of Isaac: Wrath of The Lamb Eternal Edition', url:'https://carp.teachmetofish.net/gamefile/boilambeternal.html', desc:'An even harsher Isaac run with nastier chaos.', bg:'https://imgcdn.dev/i/YRK9ra', placeholder:'ThweðŸ †' },
            { id:'tomb-of-the-mask', type:'games', title:'Tomb of the Mask', url:'https://pizzaedition.win/assets/allgames/tomb-of-the-mask/index.html', desc:'Zip through neon mazes while dodging relentless traps.', bg:'https://images.unsplash.com/photo-1511512578047-dfb367046420?q=80&w=1920', placeholder:'ToðŸ †' },
            { id:'townscaper', type:'games', title:'Townscaper', url:'https://oskarstalberg.com/Townscaper/', desc:'Relax and build whimsical island towns block by block.', bg:'https://images.unsplash.com/photo-1511512578047-dfb367046420?q=80&w=1920', placeholder:'TowðŸ †' },
            { id:'tung-tung-sahur-horror', type:'games', title:'Tung Tung Sahur Horror', url:'https://learning.trogiang.vn/gamefile/tung.html', desc:'A meme-horror chase with creepy rooms and brainrot energy.', bg:'https://images.unsplash.com/photo-1511512578047-dfb367046420?q=80&w=1920', placeholder:'TuðŸ †' },
            { id:'ultrakill', type:'games', title:'Ultrakill', url:'https://cdn.jsdelivr.net/gh/genizy/web-port@master/ultrakill/', desc:'A hyper-fast retro shooter that rewards stylish aggression.', bg:'https://images.unsplash.com/photo-1511512578047-dfb367046420?q=80&w=1920', placeholder:'UðŸŽ¯' },
            { id:'wrestle-bros', type:'games', title:'Wrestle Bros', url:'https://script.google.com/macros/s/AKfycbzf61_c1OXDbrsZz4pecMt5cUWDGwGJWXUtlOAoNdBE2acBbblA31lQmATDlBRpFVYiWw/exec', desc:'Arcade wrestling with slams, ring chaos, and fast matches.', bg:'https://images.unsplash.com/photo-1511512578047-dfb367046420?q=80&w=1920', placeholder:'WðŸ ˆ' },
            { id:'psplus', type:'games', title:'PlayStation Plus', icon:'<i class="fas fa-plus"></i>', url:'https://www.playstation.com/en-us/ps-plus/', bg:'https://images.unsplash.com/photo-1550745165-9bc0b252726f?q=80&w=1920', desc:'Access monthly games, cloud saves, and online multiplayer perks.' },
            { id:'dulo-tv', type:'media', title:'Dulo TV', icon:'<i class="fas fa-tv"></i>', url:'https://dulo.tv/', bg:'https://images.unsplash.com/photo-1574375927938-d5a98e8ffe85?q=80&w=1920', desc:'Watch TV shows and movies on Dulo TV.' },
            { id:'moon-tv', type:'media', title:'Moon TV', icon:'<i class="fas fa-moon"></i>', url:'https://moontv.to/home', bg:'https://images.unsplash.com/photo-1574375927938-d5a98e8ffe85?q=80&w=1920', desc:'Stream content on Moon TV.' },
            { id:'nikehub-movies', type:'media', title:'NikeHub Movies', icon:'<i class="fas fa-film"></i>', url:'https://nikehub.org/movies', bg:'https://images.unsplash.com/photo-1574375927938-d5a98e8ffe85?q=80&w=1920', desc:'Watch movies on NikeHub.' },
            { id:'soundboard', type:'media', title:'SoundBoard', icon:'<i class="fas fa-volume-up"></i>', url:'https://soundboardw.net/', bg:'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?q=80&w=1920', desc:'Enjoy sounds on SoundBoard.' },
            { id:'monochrome', type:'media', title:'Monochrome', icon:'<i class="fas fa-music text-5xl text-gray-500"></i>', url:'https://monochrome.tf/', bg:'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?q=80&w=1920', desc:'Listen to music on Monochrome.' },
            { id:'awp', type:'browsers', title:'AWP', icon:'<i class="fas fa-globe"></i>', url:'https://awpispeak.cfd/', bg:'https://images.unsplash.com/photo-1451187580459-43490279c0fa?q=80&w=1920', desc:'Browse the web with AWP.' },
            { id:'app-hub', type:'browsers', title:'APP Hub', icon:'<i class="fas fa-globe"></i>', url:'https://howtostudygood-forfree-tips.b-cdn.net/apps/index.html', bg:'https://images.unsplash.com/photo-1451187580459-43490279c0fa?q=80&w=1920', desc:'Access apps on APP Hub.' },
            { id:'peak', type:'browsers', title:'Peak', icon:'<i class="fas fa-globe text-5xl text-yellow-500"></i>', url:'https://script.google.com/macros/s/AKfycbzSdpA_iwyB91FA9iIyGgxq9-t_uETpzEsm8J5HKbizABDGSItsLsqb9oLfUcm2SdeM/exec', bg:'https://images.unsplash.com/photo-1451187580459-43490279c0fa?q=80&w=1920', desc:'Browse with Peak.' },
            { id:'cherry', type:'browsers', title:'Cherry', icon:'<i class="fas fa-globe"></i>', url:'https://cherrion.top/', bg:'https://images.unsplash.com/photo-1451187580459-43490279c0fa?q=80&w=1920', desc:'Browse with Cherry.' },
            { id:'cine-os', type:'browsers', title:'CineOS', icon:'<i class="fas fa-globe"></i>', url:'https://cine-os.b-cdn.net/', bg:'https://images.unsplash.com/photo-1451187580459-43490279c0fa?q=80&w=1920', desc:'Browse with CineOS.' },
            { id:'shadow', type:'browsers', title:'Shadow', icon:'<i class="fas fa-globe text-5xl text-gray-500"></i>', url:'https://easygeo.eclipsecastellon.net/', bg:'https://images.unsplash.com/photo-1451187580459-43490279c0fa?q=80&w=1920', desc:'Browse with Shadow.' },
            { id:'octorine', type:'browsers', title:'Octorine', icon:'<i class="fas fa-globe text-5xl text-orange-500"></i>', url:'https://d.clever.com.drmarcells.com/search.html', bg:'https://images.unsplash.com/photo-1451187580459-43490279c0fa?q=80&w=1920', desc:'Browse with Octorine.' },
            { id:'linkspot', type:'browsers', title:'LinkSpot', icon:'<i class="fas fa-globe text-5xl text-teal-500"></i>', url:'https://linkspotbeta2.vercel.app/', bg:'https://images.unsplash.com/photo-1451187580459-43490279c0fa?q=80&w=1920', desc:'Browse with LinkSpot.' },
            { id:'overcloaked', type:'browsers', title:'OverCloaked', icon:'<i class="fas fa-globe"></i>', url:'https://overunder5.b-cdn.net/', bg:'https://images.unsplash.com/photo-1451187580459-43490279c0fa?q=80&w=1920', desc:'Browse with OverCloaked.' },
            { id:'educationate', type:'browsers', title:'Educationate', icon:'<i class="fas fa-globe text-5xl text-pink-500"></i>', url:'https://storage.googleapis.com/educationate/index.html', bg:'https://images.unsplash.com/photo-1451187580459-43490279c0fa?q=80&w=1920', desc:'Browse with Educationate.' }
        ];

        const gameIconOverrides = {
            'baby-sniper': { img:'https://img.itch.zone/aW1nLzE1NDE5NTk2LmpwZw==/original/koNhgv.jpg' },
            'bacon-may-die': { img:'https://play-lh.googleusercontent.com/W_dghckKR-MD8Hx5YvCpdx3bYNeqrBdZqnMI02JnP5rVH8VqGaQUzdiMXd2wdJGLeP0' },
            'baseball-bros': { img:'https://baseballbrosunblocked.io/wp-content/uploads/2025/12/Baseball-Bros.webp', isLogo:false },
            'basket-bros': { img:'https://imgs.crazygames.com/basketbros_1x1/20251107022434/basketbros_1x1-cover?format=auto&quality=70&metadata=none', isLogo:false },
            'bitlife': { img:'https://play-lh.googleusercontent.com/fUM-UyywXxjC8soxAZdIlxJrlRRXmql8wkE426SHzft4lJycSKVd2jCYQQX1BEG9Xw' },
            'bloons-td5': { img:'https://play-lh.googleusercontent.com/LLEUf9Qcd6N2L4nynBArv7wHyvPLiKBJtXjFEfgD4yS80ZJtQREVjIJE_HXFRDAJxQ' },
            'bottle-flip-3d': { img:'https://play-lh.googleusercontent.com/sMpJpTPMtTMr9tfusBtbWIz_h2UdX3iwx8Ea4w6vJ-0vyFILvpIMj_JvwVSeS6Xq0bg=w240-h480-rw', isLogo:false },
            'brawl-stars-sim': { img:'https://play-lh.googleusercontent.com/WLJb9DGkxPkiqlvizxSyHnMqPOZATgfd8RH8rEo3L4FM84luI7GYKE8D2qFZNtC2OMsoo-eOy-qquwIRVl-05w' },
            'brotato': { img:'https://play-lh.googleusercontent.com/wjYph3dbtJXklfdt2yIQAEnH5ov2ZyuAPr7B0PqNJ29AhcEZX9EhOJT5hsa84tEMYIH3I-3-sSxzo04ULZ-YEg=w240-h480-rw', isLogo:false },
            'burrito-bison': { img:'https://play-lh.googleusercontent.com/vpTgm9u7-GzZP_MceTWpDi0HbinXd_4phCoTwf4ZspFL-115FtNRdo_SU1p-khLDnLA' },
            'cloverpit': { img:'https://play-lh.googleusercontent.com/2CR6ecP2mz281zfOZZoZS4kdZg1WaGfCXdQxdWmt2JkQRDSQG8NhdbgIuH0UepzEyrWTKA7zaqre6xAthebFwyA=w240-h480-rw' },
            'cod-zombies': { img:'https://s6.imgcdn.dev/YRKfut.png' },
            'the-binding-of-isaac-wrath-of-the-lamb': { img:'https://i.imgur.com/5mSBK5v.png' },
            'the-binding-of-isaac-wrath-eternal': { img:'https://i.imgur.com/Seh2qHY.png' },
            'nefarius': { img:'https://i.imgur.com/RrzVOFo.png' },
            'cookie-clicker': { img:'https://orteil.dashnet.org/cookieclicker/img/perfectCookie.png' },
            'deadshot': { img:'https://www.google.com/s2/favicons?sz=256&domain_url=https://deadshot.io/' },
            'down-town-james-brown': { img:'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTi_Lras8_RXWzWjVhAElBevM_jBFYxAmpYOxbqzrFsjg&s&ec=121638480' },
            'drive-mad': { img:'https://www.drivemad.com/img/android-chrome-512x512.png' },
            'fnaf-world': { img:'favicon.ico', isLogo:false },
            'fnaf-pizza-simulator': { img:'https://play-lh.googleusercontent.com/zDcOTck_4ZjLeJNgil4bpIXUefRUYVqOqlpc8hxeDby8LQh0eZhYDho9U3W_RVg9yuE' },
            'fnaf-sister-location': { img:'https://play-lh.googleusercontent.com/u9wx5aNNV6Yn4sJpi7uPBiElRnfAp1zUrn8Xqb4Dx_WBoOPHlB6G6gaYLI-mEXyABPnz' },
            'five-nights-ultimate-custom-night': { img:'https://play-lh.googleusercontent.com/pB7dsLLcRgADtFpEPeKc5mSyAn1E1JzrdQ1V7-Y5hizgub3G8e9UJIc5opC9mYXKSBw' },
            'flappy-bird': { img:'https://upload.wikimedia.org/wikipedia/en/thumb/0/0a/Flappy_Bird_icon.png/250px-Flappy_Bird_icon.png', isLogo:false },
            'football-bros': { img:'https://retrobowl76.io/data/image/game/FootballBros.png', isLogo:false },
            'geometry-dash': { img:'https://play-lh.googleusercontent.com/ixHXzBWPmmKWIBxDMfjbIXK10UQCTDvIYOcs_uLXHCRbdsz2siJFYfb7MqckU8eC3Ks' },
            'gladihoppers': { img:'https://play-lh.googleusercontent.com/HUuFbIPERNbpW2Q72WIqiJ8bKDzIgT_C4PnYvMBuH0wC3B_KvpKmumm1FXhZj3jmRHw' },
            'granny': { img:'https://play-lh.googleusercontent.com/yT_LBq_tyKeIDohKDsqN_Qt18jGIPUYIxY2C-1-E2YA9Qd60uZW08pua17qBmIiDPA' },
            'iron-snout': { img:'https://poki.us.com/wp-content/uploads/2025/06/Iron-Snout.png' },
            'karate-bros': { img:'https://geodashlite.io/data/image/game/karate-bros.jpg' },
            'melon-sandbox': { img:'https://play-lh.googleusercontent.com/9KgS1cF6vWMF9Fl25S36bKr8zDh0ddkTOeN7WpBcQAE-pKfahG2DjUxbQ8sespNoe3KW3qbcaVD8H6DfNys6' },
            'nefarius': { img:'https://i.imgur.com/RrzVOFo.png' },
            'retro-bowl': { img:'https://play-lh.googleusercontent.com/WRM5Y1xZmzcCP1YtO5zl6G2g7CU5c5ZfjX4UVrgi1bpNgkfy-wuB-bQx3kkeRfaGYQ' },
            'rocket-league': { img:'https://rocketgoal.io/og-image.png' },
            'rouge-souls-1': { img:'https://cdn3.kongcdn.com/game_icons/0041/3526/Icon.png?i10c=img.resize(width:180,height:180)', isLogo:false },
            'rouge-souls-2': { img:'https://cdn1.kongcdn.com/game_icons/0056/8757/250x200_thin_border.png?i10c=img.resize(width:180,height:180)', isLogo:false },
            'scritchy-scratchy': { img:'https://play-lh.googleusercontent.com/JK9gt3Lbe5Z8Z2Anztd6wH0FbDywD8CCDirlxDu5gcQ2GmIz_cUWs2YBHNteFKO04UDz_B9pzYeQuoJ8EZZtCw' },
            'shell-shockers': { img:'https://pbs.twimg.com/profile_images/1456048577839435781/GiJJhpA3_400x400.jpg' },
            'slime-rancher': { img:'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQJw5FU1brRpbmT-hN1G3Jy925NckWBiilIMg&s' },
            'slither-io': { img:'https://play-lh.googleusercontent.com/tRpviKT0mUi47iAaBne_yhe_xIuFzpW1mCIqoW457tNsKZddZHwiCUR2ga-rU3VXw04' },
            'snow-rider-3d': { img:'https://snowrider3d.run/covers/1757785613967.webp' },
            'snowball-io': { img:'https://snowball-io.io/snowball_share.jpg' },
            'soccer-bros': { img:'https://growa-garden.io/storage/images/soccer-bros.jpeg' },
            'subway-surfers': { img:'https://play-lh.googleusercontent.com/6dM_s_iNdPfxTfvuZ06r7Kz41DG1ivkjCI-oBWjR-c2NUXf7S2x9TmyOmKljYGDpBVg' },
            'survivor-io': { img:'https://play-lh.googleusercontent.com/os7JIk6PtULMjal93noyeGqWKjxQ_35sXrT708XxHq_ORk_AIhqW3_iIm8-OjuRLyDDb_MVs5EZAwC4aXIbgtA' },
            'swords-and-souls': { img:'https://cdn1.kongcdn.com/game_icons/0063/9685/250x200_BETTER.png?i10c=img.resize(width:180,height:180)', isLogo:false },
            'terraria': { img:'https://play-lh.googleusercontent.com/BoAvMI_6JGNRBp_3gFaVuLuqW_4J-rjtbR_giKFoJRvZmDiPtDlnLMur9cT7sTTfeos' },
            'the-binding-of-isaac-demo': { img:'https://cdn2.steamgriddb.com/icon_thumb/ec78e9f1c48cec8f5a6de60b921e4e46.png' },
            'the-binding-of-isaac-rebirth': { img:'https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/250900/library_600x900_2x.jpg?t=1731977365' },
            'the-binding-of-isaac-wrath-of-the-lamb': { img:'https://i.imgur.com/5mSBK5v.png' },
            'the-binding-of-isaac-wrath-eternal': { img:'https://i.imgur.com/Seh2qHY.png' },
            'tomb-of-the-mask': { img:'https://image.winudf.com/v2/image1/Y29tLnBsYXlnZW5kYXJ5LnRvbV9pY29uXzE3MzEwMDU1NTdfMDQ5/icon.webp?fakeurl=1&type=.webp&w=512' },
            'townscaper': { img:'TemplateData/favicon.ico', isLogo:false },
            'tung-tung-sahur-horror': { img:'https://2games.io/data/image/game/tung-sahur-horror/tung-sahur-horror_sq.png' },
            'ultrakill': { img:'https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/1229490/library_600x900_2x.jpg' },
            'wrestle-bros': { img:'https://1games.io/data/image/game/wrestle-bros/banner/wrestle-bros.jpeg', isLogo:false },
            'vscode': { img:'https://images.unsplash.com/photo-1542831371-29b0f74f9713?q=80&w=1920', isLogo:false }
        };

        const gameBackgroundOverrides = {
            'store': 'https://image.api.playstation.com/pr/bam-art/222/196/cd4b5ccb-6cd8-4566-a3fb-ca8b65b3a6fa.jpg',
            'explore': 'https://i.ytimg.com/vi/z7zXBf5mi2E/maxresdefault.jpg',
            'baby-sniper': 'https://img.itch.zone/aW1nLzE1NDE5NTk2LmpwZw==/original/koNhgv.jpg',
            'bacon-may-die': 'https://is1-ssl.mzstatic.com/image/thumb/Purple116/v4/10/6c/a1/106ca18d-14fd-dfd8-4111-3ef4acb3da59/AppIcon-0-0-1x_U007emarketing-0-0-0-7-0-0-sRGB-0-0-0-GLES2_U002c0-512MB-85-220-0-0.png/1200x630wa.jpg',
            'baseball-bros': 'https://i.ytimg.com/vi/KioOao2uvUI/maxresdefault.jpg',
            'basket-bros': 'https://basketbros.io/bbros_364x180.png',
            'bitlife': 'https://is1-ssl.mzstatic.com/image/thumb/PurpleSource211/v4/34/88/de/3488dec3-9975-d715-94b0-c02f7b46bf36/Placeholder.mill/1200x630wa.jpg',
            'bloons-td5': 'https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/306020/header.jpg',
            'bottle-flip-3d': 'https://is1-ssl.mzstatic.com/image/thumb/PurpleSource211/v4/57/a8/9a/57a89a93-c2d2-695d-8f17-a179fe91a522/Placeholder.mill/1200x630wa.jpg',
            'brawl-stars-sim': 'https://is1-ssl.mzstatic.com/image/thumb/PurpleSource211/v4/fb/81/9b/fb819b7b-c7bb-9be8-bd7c-18476c8d3d21/Placeholder.mill/1200x630wa.jpg',
            'brotato': 'https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/1942280/header.jpg',
            'burrito-bison': 'https://is1-ssl.mzstatic.com/image/thumb/Purple116/v4/17/68/ed/1768edfb-f9b4-f634-a80e-981f969e7366/AppIcon-1x_U007emarketing-0-7-0-85-220-0.png/1200x630wa.jpg',
            'cloverpit': 'https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/3314790/header.jpg',
            'cod-zombies': 'https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/311210/library_hero.jpg',
            'cookie-clicker': 'https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/1454400/header.jpg',
            'deadshot': 'https://deadshot.io/promo/thumbnail.png',
            'drive-mad': 'https://is1-ssl.mzstatic.com/image/thumb/PurpleSource211/v4/ad/73/1c/ad731cb2-c75d-8367-ed67-fff2b865f38b/Placeholder.mill/1200x630wa.jpg',
            'down-town-james-brown': 'https://img.icons8.com/color/1200/controller.jpg',
            'flappy-bird': 'https://upload.wikimedia.org/wikipedia/en/thumb/0/0a/Flappy_Bird_icon.png/250px-Flappy_Bird_icon.png',
            'fnaf-world': 'https://irv77.github.io/hd_fnaf/w/resources/office.png',
            'fnaf-pizza-simulator': 'https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/738060/header.jpg',
            'fnaf-sister-location': 'https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/506610/header.jpg',
            'five-nights-ultimate-custom-night': 'https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/871720/header.jpg',
            'football-bros': 'https://footballbros.io/splash.jpg',
            'geometry-dash': 'https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/322170/header.jpg',
            'gladihoppers': 'https://www.playgladihoppers.com/wp-content/uploads/2025/09/Play-Gladihoppers-Online-For-Free.webp',
            'granny': 'https://is1-ssl.mzstatic.com/image/thumb/PurpleSource211/v4/c8/0a/95/c80a951a-7305-1dda-d6b5-c7fe1b1daf64/Placeholder.mill/1200x630wa.jpg',
            'iron-snout': 'https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/424280/header.jpg',
            'karate-bros': 'https://i.ytimg.com/vi/64MLYSVCcmE/maxresdefault.jpg',
            'kart-bros': 'https://kart-bros.io/data/image/options/kartbros-banner.webp',
            'melon-sandbox': 'https://is1-ssl.mzstatic.com/image/thumb/PurpleSource211/v4/6c/47/e9/6c47e990-f37c-afd6-8ccb-f2f8efb043df/Placeholder.mill/1200x630wa.jpg',
            'nefarius': 'https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/3229030/header.jpg',
            'retro-bowl': 'https://is1-ssl.mzstatic.com/image/thumb/PurpleSource211/v4/2f/bb/7d/2fbb7dab-9c94-3522-803f-b229c5b3415b/Placeholder.mill/1200x630wa.jpg',
            'rocket-league': 'https://rocketgoal.io/og-image.png',
            'rouge-souls-1': 'https://gamemedia.armorgames.com/14014/icn_heroimage.png',
            'rouge-souls-2': 'https://i.flipline.com/othergamefiles/roguesoul2/images/infobanner.jpg',
            'scritchy-scratchy': 'https://i.ytimg.com/vi/t7UBqgTfB_A/maxresdefault.jpg',
            'shell-shockers': 'https://www.shellshock.io/img/previewImage_shellShockers.webp',
            'slime-rancher': 'https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/433340/header.jpg',
            'slither-io': 'https://slither.io/s/fbthumb5.jpg',
            'snow-rider-3d': 'https://snowrider3d.com/data/image/game/snow-rider-3d/snow-rider-3d.png',
            'snowball-io': 'https://snowball-io.io/snowball_share.jpg',
            'soccer-bros': 'https://soccerbros.gg/kick/splash.jpg',
            'subway-surfers': 'https://is1-ssl.mzstatic.com/image/thumb/PurpleSource211/v4/45/20/18/4520180d-e750-8313-1100-9ce62c2c13d0/Placeholder.mill/1200x630wa.jpg',
            'survivor-io': 'https://is1-ssl.mzstatic.com/image/thumb/PurpleSource221/v4/fe/92/36/fe92365e-51c7-afb1-f18f-bc55fb0442e8/Placeholder.mill/1200x630wa.jpg',
            'swords-and-souls': 'https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/679900/library_hero.jpg',
            'terraria': 'https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/105600/header.jpg',
            'the-binding-of-isaac-demo': 'https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/113200/header.jpg',
            'the-binding-of-isaac-rebirth': 'https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/250900/header.jpg',
            'the-binding-of-isaac-wrath-of-the-lamb': 'https://i.imgur.com/5mSBK5v.png',
            'the-binding-of-isaac-wrath-eternal': 'https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/113200/header.jpg',
            'tomb-of-the-mask': 'https://i.ytimg.com/vi/TRZeWws6JOE/maxresdefault.jpg',
            'townscaper': 'https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/1291340/header.jpg',
            'tung-tung-sahur-horror': 'https://2games.io/data/image/game/tung-sahur-horror/tung-sahur-horror_sq.png',
            'ultrakill': 'https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/1229490/header.jpg',
            'wrestle-bros': 'https://wrestlebros.io/splash.jpg',
            'psplus': 'https://image.api.playstation.com/vulcan/ap/rnd/202205/1606/TO8qsdJ4fIdCCYd2hgG4IBw9.png'
        };

        let gameData = [];

let cloudData = [];

        let originalTitle = document.title; let originalFavicon = document.querySelector('link[rel="icon"]').href;
        let currentCategory = 'games', filteredGames = [], currentIndex = 0, hoverFocusTimer = null;
        const mainStage = document.getElementById('main-stage');
        const launcherStrip = document.getElementById('launcher-strip');
        const gameList = document.getElementById('game-list');
        const bgOverlay = document.getElementById('bg-overlay');
        const activeTitle = document.getElementById('active-title');
        const activeDesc = document.getElementById('active-desc');
        const gameInfo = document.getElementById('game-info');
        const wxterWorkspace = document.getElementById('wxter-workspace');
        const wxterElements = {
            header: document.getElementById('wxter-header'),
            chatTitle: document.getElementById('wxter-chat-title'),
            newChatButton: document.getElementById('wxter-new-chat-button'),
            deleteChatButton: document.getElementById('wxter-delete-chat-button'),
            thoughtProcessFeed: document.getElementById('wxter-thought-process-feed'),
            fileChips: document.getElementById('wxter-file-chips'),
            fileInput: document.getElementById('wxter-file-input'),
            input: document.getElementById('wxter-input'),
            messageList: document.getElementById('wxter-message-list'),
            sendButton: document.getElementById('wxter-send-btn'),
            statusText: document.getElementById('wxter-status-text')
        };

        // --- Mouse Wheel Scroll Fix ---
        // Prevents the dashboard's horizontal scroll from stealing mouse wheel events
        [wxterElements.messageList].forEach(el => {
            if (!el) return;
            el.addEventListener('wheel', (e) => {
                e.stopPropagation(); // Stop event from bubbling to dashboard listeners
            }, { passive: true });
        });

        const WxterConfig = Object.freeze({
            activeThreadStorageKey: 'wxterActiveThread',
            defaultEndpoint: 'https://lately-investment-waterproof-maintaining.trycloudflare.com',
            legacyEndpoints: [
                'https://retrieve-government-affects-challenge.trycloudflare.com',
                'https://recently-adjacent-vocational-utah.trycloudflare.com',
                'https://marvel-rise-employee-operator.trycloudflare.com',
                'https://cheque-officer-proceeding-key.trycloudflare.com',
                'https://presently-funk-appraisal-piece.trycloudflare.com',
                'https://mating-robots-submitting-exp.trycloudflare.com',
                'https://medicaid-macro-separately-continuous.trycloudflare.com',
                'https://motors-implies-rooms-bought.trycloudflare.com',
                'https://infringement-guided-you-handbook.trycloudflare.com'
            ],
            endpointStorageKey: 'wxterApiBaseUrl',
            maxQueuedFiles: 8,
            threadsStorageKey: 'wxterThreads'
        });
