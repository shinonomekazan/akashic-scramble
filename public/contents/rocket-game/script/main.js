function main(param) {
    const scene = new g.Scene({
        game: g.game,
        // ★ title.png をアセットに追加
        assetIds: ["rocket", "debris1", "debris2", "debris3", "debris4", "title"]
    });

    scene.onLoad.add(() => {
        const rocketImageAsset = scene.asset.getImageById("rocket");
        const titleImageAsset = scene.asset.getImageById("title");
        const popFontFamily = "Arial Rounded MT Bold, Helvetica Neue, sans-serif, fantasy";
        const font = new g.DynamicFont({ game: g.game, size: 24, fontFamily: popFontFamily, fontWeight: "bold" });
        const bigFont = new g.DynamicFont({ game: g.game, size: 64, fontFamily: popFontFamily, fontWeight: "bold" });

        function normalizePolygons(polygons, toolW, toolH) {
            return polygons.map(poly => poly.map(p => ({
                x: (p.x - toolW / 2) / (toolW / 2),
                y: (p.y - toolH / 2) / (toolH / 2)
            })));
        }

        const rocketW = rocketImageAsset.width || 80;
        const rocketH = rocketImageAsset.height || 32;

        const CONFIG = {
            debrisStartZ: 50.0,
            debrisScaleMultiplier: 8.0,
            minSpawnInterval: 40,
            rocketPolygons: normalizePolygons([
                [{"x":37.75,"y":2}, {"x":77.15,"y":8.2}, {"x":37.75,"y":30.5}, {"x":-2.05,"y":7.9}]
            ], rocketW, rocketH),
            debrisPolygons: [
                normalizePolygons([[{"x":671,"y":401}, {"x":283,"y":690}, {"x":249,"y":597}, {"x":234,"y":507}, {"x":368,"y":364}, {"x":536,"y":357}],[{"x":761,"y":455}, {"x":782,"y":596}, {"x":609,"y":573}, {"x":517,"y":512}, {"x":668,"y":399}],[{"x":307,"y":769}, {"x":270,"y":733}, {"x":288,"y":685}, {"x":465,"y":555}, {"x":482,"y":600}],[{"x":348,"y":727}, {"x":482,"y":597}, {"x":696,"y":749}, {"x":582,"y":811}, {"x":432,"y":793}, {"x":382,"y":765}],[{"x":528,"y":648}, {"x":698,"y":751}, {"x":789,"y":595}, {"x":595,"y":568}, {"x":603,"y":572}]], 1024, 1024),
                normalizePolygons([[{"x":291,"y":457},{"x":322,"y":449},{"x":370,"y":394},{"x":408,"y":399},{"x":434,"y":364},{"x":506,"y":387},{"x":565,"y":398},{"x":621,"y":434},{"x":667,"y":470},{"x":710,"y":451},{"x":725,"y":530},{"x":773,"y":588},{"x":769,"y":634},{"x":740,"y":639},{"x":662,"y":738},{"x":625,"y":764},{"x":579,"y":751},{"x":541,"y":737},{"x":506,"y":705},{"x":453,"y":679},{"x":382,"y":674},{"x":355,"y":638},{"x":355,"y":597},{"x":307,"y":564},{"x":266,"y":499}]], 1024, 1024),
                normalizePolygons([[{"x":475,"y":550}, {"x":409,"y":735}, {"x":334,"y":696}, {"x":148,"y":475}, {"x":122,"y":289}, {"x":322,"y":442}],[{"x":407,"y":743}, {"x":573,"y":774}, {"x":691,"y":754}, {"x":735,"y":751}, {"x":899,"y":680}, {"x":936,"y":665}, {"x":888,"y":593}, {"x":599,"y":596}, {"x":476,"y":551}]], 1024, 1024),
                normalizePolygons([[{"x":358,"y":636}, {"x":137,"y":423}, {"x":447,"y":425}, {"x":536,"y":579}],[{"x":447,"y":425}, {"x":536,"y":579}, {"x":737,"y":542}, {"x":752,"y":236}],[{"x":737,"y":542}, {"x":536,"y":579}, {"x":598,"y":715}, {"x":907,"y":716}],[{"x":598,"y":715}, {"x":536,"y":579}, {"x":391,"y":623}, {"x":520,"y":888}]], 1024, 1024)
            ]
        };

        function getTransformedVertices(target, vertices) {
            const rad = target.angle * Math.PI / 180;
            const cos = Math.cos(rad); const sin = Math.sin(rad);
            const hw = (target.width || 256) / 2;
            const hh = (target.height || 256) / 2;
            const scaleX = target.scaleX !== undefined ? target.scaleX : 1.0;
            const scaleY = target.scaleY !== undefined ? target.scaleY : 1.0;
            return vertices.map(v => {
                const rx = (v.x * hw) * scaleX;
                const ry = (v.y * hh) * scaleY;
                return { x: target.x + (rx * cos - ry * sin), y: target.y + (rx * sin + ry * cos) };
            });
        }

        function checkCollision(verts1, verts2) {
            const polys = [verts1, verts2];
            for (let p of polys) {
                for (let i = 0; i < p.length; i++) {
                    const j = (i + 1) % p.length;
                    const normal = { x: -(p[j].y - p[i].y), y: p[j].x - p[i].x };
                    let min1 = Infinity, max1 = -Infinity, min2 = Infinity, max2 = -Infinity;
                    for (let v of verts1) { const dot = v.x * normal.x + v.y * normal.y; min1 = Math.min(min1, dot); max1 = Math.max(max1, dot); }
                    for (let v of verts2) { const dot = v.x * normal.x + v.y * normal.y; min2 = Math.min(min2, dot); max2 = Math.max(max2, dot); }
                    if (max1 < min2 || max2 < min1) return false;
                }
            }
            return true;
        }

        function checkComplexCollision(polygons1, polygons2) {
            for (let p1 of polygons1) { for (let p2 of polygons2) { if (checkCollision(p1, p2)) return true; } }
            return false;
        }

        var debrisSize = 1024;
        var rand = g.game.random;
        var playing = false;
        var isGameOver = false; // ★ 衝突時のフリーズ判定用
        var elapsed = 0;
        var inputState = { up: false, down: false, left: false, right: false };
        var inputX = 0, inputY = 0;

        var joinedPlayerIds = [];
        var playerRoles = {};
        var playerNames = {};
        const nameCandidates = ["ウエダ", "ライト", "ダリ", "シッダルタ"];
        var sequenceStarted = false;

        const rocketZ = 0.15;
        const centerX = g.game.width / 2;
        const centerY = g.game.height / 2;

        var currentSpawnInterval = 120;
        var spawnTimer = 0;

        var gameLayer = new g.E({ scene: scene });
        var titleLayer = new g.E({ scene: scene });
        var titleButtonsLayer = new g.E({ scene: scene }); // ボタンだけ即座に消す用
        var resultLayer = new g.E({ scene: scene });
        var animeLayer = new g.E({ scene: scene });

        var backRect = new g.FilledRect({ scene: scene, width: g.game.width, height: g.game.height, cssColor: "black" });
        var starLayer = new g.E({ scene: scene });
        var debrisLayer = new g.E({ scene: scene });
        var rocketLayer = new g.E({ scene: scene });
        var uiLayer = new g.E({ scene: scene });

        // ★ 階層構造の見直し（背景と自機は最初から見せる）
        scene.append(gameLayer);
        scene.append(titleLayer);
        titleLayer.append(titleButtonsLayer);
        scene.append(resultLayer);
        scene.append(animeLayer);

        gameLayer.append(backRect);
        gameLayer.append(starLayer);
        gameLayer.append(debrisLayer);
        gameLayer.append(rocketLayer);
        gameLayer.append(uiLayer);

        scene.onMessage.add((msg) => {
            if (msg.data && msg.data.type === "input" && canControlDirection(msg, msg.data.dir)) {
                setInputDirection(msg.data.dir, msg.data.state);
            }
        });

        function setInputDirection(direction, state) {
            if (!playing || isGameOver) return;
            inputState[direction] = state;
            const btn = inputButtons[direction];
            if (btn) {
                btn.label.textColor = state ? "white" : btn.baseColor;
                btn.label.opacity = state ? 1.0 : 0.6;
                btn.label.modified();
            }
        }

        function createTextButton(parent, text, x, y, width, height, color, onClick) {
            var container = new g.E({ scene: scene, x: x, y: y, width: width, height: height, touchable: true });
            var rect = new g.FilledRect({ scene: scene, width: width, height: height, cssColor: color });
            var label = new g.Label({ scene: scene, font: font, text: text, fontSize: 22, x: 0, y: (height - 22) / 2, width: width, textAlign: "center", textColor: "white" });
            container.append(rect); container.append(label);
            container.onPointDown.add(() => { rect.opacity = 0.7; rect.modified(); });
            container.onPointUp.add((ev) => { rect.opacity = 1.0; rect.modified(); if (onClick) onClick(ev); });
            parent.append(container);
            return container;
        }

        function getPlayerIdFromEvent(ev) {
            return (ev && ev.player && ev.player.id) ? ev.player.id : (g.game.selfId || "local");
        }

        function canControlDirection(ev, direction) {
            const playerId = getPlayerIdFromEvent(ev);
            return !!playerRoles[playerId] && playerRoles[playerId].includes(direction);
        }

        function resetStar(star) {
            star.worldX = (rand.generate() * 2 - 1) * (g.game.width * 2);
            star.worldY = (rand.generate() * 2 - 1) * (g.game.height * 2);
            star.z = 1.0;
            star.speedZ = 0.001 + rand.generate() * 0.002;
            star.baseSize = 1 + rand.generate() * 1.5;
        }
        var stars = [];
        for (var i = 0; i < 90; i++) {
            var star = new g.FilledRect({ scene: scene, width: 2, height: 2, cssColor: ["#ffffff", "#4dabff", "#ff4d6d"][Math.floor(rand.generate() * 3)], anchorX: 0.5, anchorY: 0.5 });
            resetStar(star); starLayer.append(star); stars.push(star);
        }

        var obstacles = [];
        function spawnObstacle() {
            var assetIndex = Math.floor(rand.generate() * 4);
            var obs = new g.E({ scene: scene, width: debrisSize, height: debrisSize, anchorX: 0.5, anchorY: 0.5 });
            var sprite = new g.Sprite({ scene: scene, src: scene.asset.getImageById("debris" + (assetIndex + 1)), width: debrisSize, height: debrisSize, srcWidth: 1024, srcHeight: 1024, anchorX: 0.5, anchorY: 0.5, x: debrisSize / 2, y: debrisSize / 2 });
            obs.append(sprite);
            obs.sprite = sprite;
            obs.polyGroupsData = CONFIG.debrisPolygons[assetIndex];

            obs.startZ = CONFIG.debrisStartZ;
            obs.collisionZ = rocketZ + 0.08;
            obs.approachTime = 5 + rand.generate() * 3;
            obs.age = 0;

            obs.baseScale = (0.5 + rand.generate() * 1.5) * CONFIG.debrisScaleMultiplier;
            obs.rotateSpeed = (rand.generate() - 0.5) * 4.0;

            let shiftX = playing ? (inputX * 5) * (obs.approachTime * g.game.fps) : 0;
            let shiftY = playing ? (inputY * 5) * (obs.approachTime * g.game.fps) : 0;

            obs.worldX = (rand.generate() - 0.5) * g.game.width * 3.5 + shiftX;
            obs.worldY = (rand.generate() - 0.5) * g.game.height * 3.5 + shiftY;

            obs.velX = (rand.generate() - 0.5) * 1.5;
            obs.velY = (rand.generate() - 0.5) * 1.5;
            obs.z = obs.startZ;

            var initialSc = obs.baseScale * (0.2 / obs.z);
            obs.scaleX = obs.scaleY = initialSc;
            obs.x = centerX + obs.worldX / obs.z;
            obs.y = centerY + obs.worldY / obs.z;

            debrisLayer.append(obs);
            obstacles.push(obs);
        }

        var inputButtons = {};
        function createInputButton(direction, x, y, color, arrowText) {
            var container = new g.E({ scene: scene, x: x, y: y, width: 100, height: 100, touchable: true });
            var label = new g.Label({ scene: scene, font: bigFont, text: arrowText, fontSize: 80, x: 0, y: 0, width: 100, textAlign: "center", textColor: color, opacity: 0.6 });
            var nameLabel = new g.Label({ scene: scene, font: font, text: "", fontSize: 14, x: 0, y: 75, width: 100, textAlign: "center", textColor: "white" });
            container.append(label); container.append(nameLabel);
            uiLayer.append(container);
            container.onPointDown.add((ev) => { if (canControlDirection(ev, direction)) setInputDirection(direction, true); });
            container.onPointUp.add((ev) => { if (canControlDirection(ev, direction)) setInputDirection(direction, false); });
            inputButtons[direction] = { container: container, label: label, nameLabel: nameLabel, baseColor: color };
        }

        var bottomY = g.game.height - 130;
        createInputButton("up", centerX - 50, bottomY - 90, "#3a86ff", "▲");
        createInputButton("down", centerX - 50, bottomY + 20, "#8338ec", "▼");
        createInputButton("left", centerX - 160, bottomY + 20, "#ff006e", "◀");
        createInputButton("right", centerX + 60, bottomY + 20, "#fb5607", "▶");

        var warningLabel = new g.Label({ scene: scene, font: font, text: "操作が食い合ってます！", fontSize: 20, textColor: "red", textAlign: "center", width: 200, opacity: 0 });
        uiLayer.append(warningLabel);

        function updateAssignments() {
            var dirs = ["up", "down", "left", "right"];
            for (let i = dirs.length - 1; i > 0; i--) { let r = Math.floor(rand.generate() * (i + 1)); [dirs[i], dirs[r]] = [dirs[r], dirs[i]]; }
            var names = nameCandidates.slice();
            for (let i = names.length - 1; i > 0; i--) { let r = Math.floor(rand.generate() * (i + 1)); [names[i], names[r]] = [names[r], names[i]]; }
            playerRoles = {}; playerNames = {};
            var dirToOwner = {};
            for (let i = 0; i < joinedPlayerIds.length; i++) {
                let pid = joinedPlayerIds[i];
                let count = (joinedPlayerIds.length === 1) ? 4 : (joinedPlayerIds.length === 2) ? 2 : (joinedPlayerIds.length === 3 && i === 0) ? 2 : 1;
                let mine = []; for (let k = 0; k < count; k++) { let d = dirs.pop(); if (d) { mine.push(d); dirToOwner[d] = names[i]; } }
                playerRoles[pid] = mine; playerNames[pid] = names[i];
            }
            var myId = g.game.selfId || "local";
            Object.keys(inputButtons).forEach(dir => {
                var btn = inputButtons[dir];
                btn.nameLabel.text = dirToOwner[dir] || "---"; btn.nameLabel.invalidate();
                btn.container.opacity = (playerRoles[myId] || []).includes(dir) ? 1.0 : 0.25;
                btn.container.modified();
            });
        }

        if (typeof window !== "undefined") {
            const keyMap = { "ArrowUp": "up", "w": "up", "ArrowDown": "down", "s": "down", "ArrowLeft": "left", "a": "left", "ArrowRight": "right", "d": "right" };
            window.addEventListener("keydown", (e) => {
                const dir = keyMap[e.key]; var pid = g.game.selfId || "local";
                if (dir && playerRoles[pid] && playerRoles[pid].includes(dir) && playing && !isGameOver) {
                    if (e.key.indexOf("Arrow") !== -1) e.preventDefault();
                    g.game.raiseEvent(new g.MessageEvent({ type: "input", dir: dir, state: true }));
                }
            });
            window.addEventListener("keyup", (e) => {
                const dir = keyMap[e.key]; var pid = g.game.selfId || "local";
                if (dir && playerRoles[pid] && playerRoles[pid].includes(dir) && playing && !isGameOver) {
                    g.game.raiseEvent(new g.MessageEvent({ type: "input", dir: dir, state: false }));
                }
            });
        }

        var rocket = new g.Sprite({
            scene: scene, src: rocketImageAsset,
            anchorX: 0.5, anchorY: 0.5, x: centerX, y: centerY
        });
        rocketLayer.append(rocket);
        var scoreLabel = new g.Label({ scene: scene, font: font, text: "距離: 0", x: 10, y: 10, textColor: "white" });
        uiLayer.append(scoreLabel);

        scene.onUpdate.add(() => {
            // ★ 衝突後はアップデートを完全にストップ（背景もデブリも停止）
            if (isGameOver) return;

            var conflictX = inputState.left && inputState.right;
            var conflictY = inputState.up && inputState.down;
            var isConflict = conflictX || conflictY;

            if (playing && isConflict) {
                var flash = (elapsed % 10 < 5);
                rocket.opacity = flash ? 0.2 : 1.0;
                warningLabel.opacity = 0.6;
                warningLabel.x = rocket.x - warningLabel.width / 2;
                warningLabel.y = rocket.y - rocket.height/2 - 45;
            } else {
                rocket.opacity = 1.0; warningLabel.opacity = 0;
            }
            rocket.modified(); warningLabel.modified();

            inputX = playing ? (inputState.right ? 1 : 0) - (inputState.left ? 1 : 0) : 0;
            inputY = playing ? (inputState.down ? 1 : 0) - (inputState.up ? 1 : 0) : 0;

            // ★ 星とデブリで完全に同一の移動係数を適用し、Z軸のプロジェクションで3D視差を作る
            var moveX = -inputX * 8;
            var moveY = -inputY * 8;

            rocket.angle = inputX * 15; rocket.modified();

            var speedFactor = playing ? 1.0 : 0.1;
            stars.forEach(star => {
                star.z -= star.speedZ * speedFactor; if (star.z <= 0.08) resetStar(star);
                // ★ 統一の移動計算
                star.worldX += moveX;
                star.worldY += moveY;
                var sc = 0.5 + (1 - star.z) * 1.5; star.width = star.height = Math.max(1, Math.round(star.baseSize * sc));
                star.x = centerX + star.worldX / star.z; star.y = centerY + star.worldY / star.z; star.modified();
            });

            if (playing) elapsed++;

            const currentRocketPolys = CONFIG.rocketPolygons.map(poly => getTransformedVertices(rocket, poly));

            for (var i = obstacles.length - 1; i >= 0; i--) {
                var obs = obstacles[i];
                obs.age += speedFactor;

                var ratio = Math.min((obs.age / g.game.fps) / obs.approachTime, 2);
                obs.z = obs.startZ - (obs.startZ - obs.collisionZ) * ratio;

                // ★ 統一の移動計算
                obs.worldX += moveX + obs.velX;
                obs.worldY += moveY + obs.velY;

                var sc = obs.baseScale * (0.2 / obs.z);
                obs.scaleX = obs.scaleY = sc;
                obs.x = centerX + obs.worldX / obs.z;
                obs.y = centerY + obs.worldY / obs.z;

                obs.sprite.angle += obs.rotateSpeed;
                obs.sprite.modified();

                if (playing && Math.abs(obs.z - rocketZ) < 0.08) {
                    const currentObsPolys = obs.polyGroupsData.map(poly => getTransformedVertices(obs, poly));
                    if (checkComplexCollision(currentRocketPolys, currentObsPolys)) {
                        isGameOver = true;
                        endGame();
                        return; // 即座にストップ
                    }
                }

                if (obs.z <= 0.06) { obs.destroy(); obstacles.splice(i, 1); }
                else { obs.modified(); }
            }

            if (debrisLayer.children && debrisLayer.children.length > 0) {
                debrisLayer.children.sort((a, b) => b.z - a.z);
                debrisLayer.modified();
            }

            if (playing) {
                spawnTimer--;
                if (spawnTimer <= 0) {
                    spawnObstacle();
                    currentSpawnInterval = Math.max(CONFIG.minSpawnInterval, 120 - Math.floor(elapsed / g.game.fps / 3) * 5);
                    spawnTimer = currentSpawnInterval;
                }
            }

            scoreLabel.text = "距離: " + Math.floor(elapsed / g.game.fps); scoreLabel.invalidate();
        });

        var titleSprite = new g.Sprite({ scene: scene, src: titleImageAsset, width: 1024, height: 1024, anchorX: 0.5, anchorY: 0.5, x: centerX, y: centerY - 150, scaleX: 0.5, scaleY: 0.5 });
        titleLayer.append(titleSprite);

        var playerLabel = new g.Label({ scene: scene, font: font, text: "参加者: 0人", x: 0, y: centerY + 30, width: g.game.width, textAlign: "center", textColor: "#aaa" });
        titleButtonsLayer.append(playerLabel);

        function joinPlayer(ev) {
            var pid = getPlayerIdFromEvent(ev);
            if (!joinedPlayerIds.includes(pid) && joinedPlayerIds.length < 4) { joinedPlayerIds.push(pid); playerLabel.text = "参加者: " + joinedPlayerIds.length + "人"; playerLabel.invalidate(); }
        }

        function requestStart(ev) {
            if (sequenceStarted) return;
            if (joinedPlayerIds.length === 0) joinedPlayerIds.push(getPlayerIdFromEvent(ev));
            startSequence();
        }

        const joinButtonRect = { x: (g.game.width-200)/2, y: centerY + 80, width: 200, height: 50 };
        const startButtonRect = { x: (g.game.width-200)/2, y: centerY + 150, width: 200, height: 60 };

        createTextButton(titleButtonsLayer, "搭乗する", joinButtonRect.x, joinButtonRect.y, joinButtonRect.width, joinButtonRect.height, "#444", joinPlayer);
        createTextButton(titleButtonsLayer, "航行開始", startButtonRect.x, startButtonRect.y, startButtonRect.width, startButtonRect.height, "#2d7dd2", requestStart);

        // ★ ご要望のタイトルシーケンス処理
        function startSequence() {
            sequenceStarted = true;
            titleButtonsLayer.hide();
            uiLayer.show();
            updateAssignments();

            var pid = g.game.selfId || "local";
            var keys = (playerRoles[pid] || []).map(d => ({"up":"上","down":"下","left":"左","right":"右"}[d])).join("・");

            let seqFrame = 0;
            let fps = g.game.fps || 30;

            let leftText1 = new g.Label({ scene: scene, font: font, text: "ようこそ、パイロット・" + (playerNames[pid] || "名無し"), textColor: "white", x: -400, y: centerY - 40 });
            let leftText2 = new g.Label({ scene: scene, font: font, text: "あなたの担当は " + keys + " です", textColor: "yellow", x: -400, y: centerY });
            let rightText = new g.Label({ scene: scene, font: bigFont, text: "3", textColor: "white", x: g.game.width + 100, y: centerY - 50, width: 100, textAlign: "right" });

            animeLayer.append(leftText1); animeLayer.append(leftText2); animeLayer.append(rightText);

            let seqHandler = () => {
                seqFrame++;

                // 1. タイトル上スライド
                if (seqFrame <= fps && titleSprite.visible()) {
                    titleSprite.y -= 15; titleSprite.modified();
                } else if (seqFrame === fps + 1) {
                    titleSprite.hide();
                }

                // 2. 左から順番にスライドイン
                if (seqFrame > 0 && seqFrame <= 15) {
                    leftText1.x += (50 - leftText1.x) * 0.2; leftText1.modified();
                }
                if (seqFrame > 15 && seqFrame <= 30) {
                    leftText2.x += (50 - leftText2.x) * 0.2; leftText2.modified();
                }

                // 3. 右からカウントダウン
                if (seqFrame === 45) { rightText.x = g.game.width - 150; rightText.modified(); }
                if (seqFrame === 75) { rightText.text = "2"; rightText.invalidate(); }
                if (seqFrame === 105) { rightText.text = "1"; rightText.invalidate(); }

                // 4. 元来た方向にスライドアウト
                if (seqFrame >= 135 && seqFrame <= 150) {
                    leftText1.x -= 30; leftText1.modified();
                    leftText2.x -= 30; leftText2.modified();
                    rightText.x += 30; rightText.modified();
                }

                // 5. GO! 表示とゲーム開始
                if (seqFrame === 150) {
                    leftText1.destroy(); leftText2.destroy(); rightText.destroy();
                    scene.onUpdate.remove(seqHandler);

                    playing = true; // ★ ここで初めて背景が加速し、デブリのスポーンが始まる

                    let goLabel = new g.Label({ scene: scene, font: bigFont, text: "GO！", fontSize: 120, textColor: "white", x: centerX, y: centerY, anchorX: 0.5, anchorY: 0.5, opacity: 0.8 });
                    animeLayer.append(goLabel);

                    let goTimer = 0;
                    let duration = fps * 2; // 2秒
                    let goHandler = () => {
                        if (isGameOver) { scene.onUpdate.remove(goHandler); return; }
                        goTimer++;
                        goLabel.scaleX = 1 + (goTimer / duration);
                        goLabel.scaleY = 1 + (goTimer / duration);
                        goLabel.opacity = 0.8 * (1 - (goTimer / duration));
                        goLabel.modified();
                        if (goTimer >= duration) {
                            goLabel.destroy();
                            scene.onUpdate.remove(goHandler);
                        }
                    };
                    scene.onUpdate.add(goHandler);
                }
            };
            scene.onUpdate.add(seqHandler);
        }

        function endGame() {
            playing = false;
            resultLayer.show();
            resultScoreLabel.text = "距離: " + Math.floor(elapsed / g.game.fps); resultScoreLabel.invalidate();
        }

        var resultBg = new g.FilledRect({ scene: scene, width: g.game.width, height: g.game.height, cssColor: "rgba(0,0,0,0.8)" });
        resultLayer.append(resultBg);
        var resultScoreLabel = new g.Label({ scene: scene, font: bigFont, text: "距離: 0", x: 0, y: 150, width: g.game.width, textAlign: "center", textColor: "white" });
        resultLayer.append(resultScoreLabel);

        createTextButton(resultLayer, "リトライ", (g.game.width-200)/2, 260, 200, 50, "#2d7dd2", () => {
            // リトライ時のリセット処理
            resultLayer.hide(); uiLayer.hide(); titleButtonsLayer.show(); titleSprite.show(); titleSprite.y = centerY - 150; titleSprite.modified();
            obstacles.forEach(o => o.destroy()); obstacles = [];
            isGameOver = false; elapsed = 0; inputState = { up: false, down: false, left: false, right: false };
            Object.values(inputButtons).forEach(b => { b.label.textColor = b.baseColor; b.label.opacity = 0.6; b.label.modified(); });
            sequenceStarted = false;
            startSequence();
        });
        createTextButton(resultLayer, "タイトルへ", (g.game.width-200)/2, 330, 200, 50, "#444", () => {
            joinedPlayerIds = []; playerLabel.text = "参加者: 0人"; playerLabel.invalidate();
            resultLayer.hide(); uiLayer.hide(); titleButtonsLayer.show(); titleSprite.show(); titleSprite.y = centerY - 150; titleSprite.modified();
            obstacles.forEach(o => o.destroy()); obstacles = [];
            isGameOver = false; elapsed = 0; sequenceStarted = false;
        });

        // 初期状態：UIとリザルトは非表示（背景と自機は最初から見せる）
        uiLayer.hide(); resultLayer.hide();
    });
    g.game.pushScene(scene);
}
module.exports = main;
