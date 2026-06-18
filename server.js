const express = require("express");
const axios = require("axios");
const session = require("express-session");
const passport = require("passport");
const DiscordStrategy = require("passport-discord").Strategy;
require("dotenv").config();

const app = express();

app.use(express.json());
app.use(express.static("public"));

app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false
}));

app.use(passport.initialize());
app.use(passport.session());

const GRUPO_ID = Number(process.env.ROBLOX_GROUP_ID);

const RANK_DONO = 255;
const RANK_RECRUTA = 2;
const RANK_GENERAL = 23;

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((user, done) => done(null, user));

passport.use(new DiscordStrategy({
    clientID: process.env.DISCORD_CLIENT_ID,
    clientSecret: process.env.DISCORD_CLIENT_SECRET,
    callbackURL: process.env.DISCORD_CALLBACK_URL,
    scope: ["identify", "guilds", "guilds.members.read"]
}, (accessToken, refreshToken, profile, done) => {
    profile.accessToken = accessToken;
    return done(null, profile);
}));

function precisaLogin(req, res, next) {
    if (!req.user) {
        return res.status(401).json({ msg: "Faça login no Discord." });
    }
    next();
}

async function temCargoPermitido(req) {
    const cargosPermitidos = process.env.DISCORD_ROLE_PERMITIDO.split(",");
    const guildId = process.env.DISCORD_GUILD_ID;

    const response = await axios.get(
        `https://discord.com/api/users/@me/guilds/${guildId}/member`,
        {
            headers: {
                Authorization: `Bearer ${req.user.accessToken}`
            }
        }
    );

    return response.data.roles.some(id => cargosPermitidos.includes(id));
}

async function pegarUsuarioRoblox(nick) {
    const response = await axios.post(
        "https://users.roblox.com/v1/usernames/users",
        {
            usernames: [nick],
            excludeBannedUsers: false
        }
    );

    return response.data.data[0];
}

async function pegarAvatar(userId) {
    const response = await axios.get(
        `https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${userId}&size=150x150&format=Png`
    );

    return response.data.data[0].imageUrl;
}

async function pegarInfoGrupo(userId) {
    const response = await axios.get(
        `https://groups.roblox.com/v2/users/${userId}/groups/roles`
    );

    const grupo = response.data.data.find(g => g.group.id === GRUPO_ID);

    if (!grupo) return null;

    return {
        roleName: grupo.role.name,
        roleRank: grupo.role.rank
    };
}

async function pegarRolesDoGrupoOpenCloud() {
    let allRoles = [];
    let nextPageToken = "";

    do {
        const response = await axios.get(
            `https://apis.roblox.com/cloud/v2/groups/${GRUPO_ID}/roles`,
            {
                headers: {
                    "x-api-key": process.env.ROBLOX_API_KEY
                },
                params: {
                    maxPageSize: 100,
                    pageToken: nextPageToken
                }
            }
        );

        const roles = response.data.groupRoles || response.data.roles || [];
        allRoles.push(...roles);

        nextPageToken = response.data.nextPageToken || "";
    } while (nextPageToken);

    return allRoles;
}

async function pegarRolePathPeloRank(rank) {
    const roles = await pegarRolesDoGrupoOpenCloud();
    const role = roles.find(r => Number(r.rank) === Number(rank));

    if (!role) return null;

    return role.path;
}

async function pegarNomeCargoPeloRank(rank) {
    const roles = await pegarRolesDoGrupoOpenCloud();
    const role = roles.find(r => Number(r.rank) === Number(rank));

    if (!role) return `Rank ${rank}`;

    return `${role.displayName} | Rank ${role.rank}`;
}

async function mudarCargoRoblox(userId, rolePath) {
    await axios.patch(
        `https://apis.roblox.com/cloud/v2/groups/${GRUPO_ID}/memberships/${userId}`,
        {
            role: rolePath
        },
        {
            headers: {
                "x-api-key": process.env.ROBLOX_API_KEY,
                "Content-Type": "application/json"
            }
        }
    );
}

async function removerDoGrupo(userId) {
    await axios.delete(
        `https://apis.roblox.com/cloud/v2/groups/${GRUPO_ID}/memberships/${userId}`,
        {
            headers: {
                "x-api-key": process.env.ROBLOX_API_KEY
            }
        }
    );
}

async function enviarLog(tipo, admin, alvo, motivo, cargoAntes, cargoDepois) {
    if (!process.env.DISCORD_WEBHOOK_LOGS) return;

    const horario = new Date().toLocaleString("pt-BR", {
        timeZone: "America/Sao_Paulo"
    });

    let cor = 0x00ff66;
    let emoji = "✅";

    if (tipo === "Rebaixamento") {
        cor = 0xff3333;
        emoji = "📉";
    }

    if (tipo === "Remoção" || tipo === "Exoneração") {
        cor = 0xff9900;
        emoji = "⛔";
    }

    await axios.post(process.env.DISCORD_WEBHOOK_LOGS, {
        embeds: [
            {
                title: `${emoji} ${tipo} Registrada`,
                color: cor,
                fields: [
                    {
                        name: "👤 Responsável",
                        value: `\`${admin}\``,
                        inline: true
                    },
                    {
                        name: "🎯 Militar",
                        value: `\`${alvo}\``,
                        inline: true
                    },
                    {
                        name: "📌 Motivo",
                        value: motivo,
                        inline: false
                    },
                    {
                        name: "⬅️ Cargo anterior",
                        value: cargoAntes,
                        inline: true
                    },
                    {
                        name: "➡️ Cargo novo",
                        value: cargoDepois,
                        inline: true
                    },
                    {
                        name: "🕒 Horário",
                        value: horario,
                        inline: false
                    }
                ],
                footer: {
                    text: "Painel Militar • Sistema de Administração"
                },
                timestamp: new Date().toISOString()
            }
        ]
    });
}

app.get("/auth/discord", passport.authenticate("discord"));

app.get("/auth/discord/callback",
    passport.authenticate("discord", {
        failureRedirect: "/"
    }),
    (req, res) => res.redirect("/")
);

app.get("/cargos", async (req, res) => {
    try {
        const roles = await pegarRolesDoGrupoOpenCloud();

        const cargos = roles
            .map(role => ({
                name: role.displayName,
                rank: role.rank
            }))
            .sort((a, b) => a.rank - b.rank);

        res.json({ cargos });
    } catch {
        res.json({ cargos: [] });
    }
});

app.get("/usuario/:nick", async (req, res) => {
    try {
        const user = await pegarUsuarioRoblox(req.params.nick);

        if (!user) {
            return res.json({ erro: "Usuário não encontrado." });
        }

        const avatar = await pegarAvatar(user.id);
        const grupo = await pegarInfoGrupo(user.id);

        res.json({
            avatar,
            cargo: grupo ? grupo.roleName : "Sem grupo",
            rank: grupo ? grupo.roleRank : 0
        });
    } catch {
        res.json({ erro: "Erro ao buscar usuário." });
    }
});

async function processarMudanca(tipo, req, res) {
    try {
        const permitido = await temCargoPermitido(req);

        if (!permitido) {
            return res.json({ msg: "Sem permissão no Discord." });
        }

        const { nick, alvo, cargo, motivo } = req.body;

        if (!motivo) {
            return res.json({ msg: "Motivo obrigatório." });
        }

        const adminUser = await pegarUsuarioRoblox(nick);
        const alvoUser = await pegarUsuarioRoblox(alvo);

        if (!adminUser || !alvoUser) {
            return res.json({ msg: "Usuário Roblox não encontrado." });
        }

        const adminGrupo = await pegarInfoGrupo(adminUser.id);
        const alvoGrupo = await pegarInfoGrupo(alvoUser.id);

        if (!adminGrupo || !alvoGrupo) {
            return res.json({ msg: "Admin ou alvo não está no grupo." });
        }

        const novoRank = Number(cargo);

        if (adminGrupo.roleRank === RANK_RECRUTA) {
            return res.json({ msg: "Recruta não pode gerenciar." });
        }

        if (
            adminGrupo.roleRank !== RANK_DONO &&
            adminGrupo.roleRank <= alvoGrupo.roleRank
        ) {
            return res.json({
                msg: "Você não pode gerenciar alguém igual ou maior."
            });
        }

        if (tipo === "promover" && novoRank <= alvoGrupo.roleRank) {
            return res.json({
                msg: "Escolha um cargo maior que o atual."
            });
        }

        if (tipo === "rebaixar") {
            if (adminGrupo.roleRank < RANK_GENERAL) {
                return res.json({
                    msg: "Apenas General ou superior pode rebaixar."
                });
            }

            if (novoRank >= alvoGrupo.roleRank) {
                return res.json({
                    msg: "Escolha um cargo menor que o atual."
                });
            }
        }

        const rolePath = await pegarRolePathPeloRank(novoRank);

        if (!rolePath) {
            return res.json({ msg: "Cargo não encontrado." });
        }

        const cargoAntes = `${alvoGrupo.roleName} | Rank ${alvoGrupo.roleRank}`;
        const cargoDepois = await pegarNomeCargoPeloRank(novoRank);

        await mudarCargoRoblox(alvoUser.id, rolePath);

        await enviarLog(
            tipo === "promover" ? "Promoção" : "Rebaixamento",
            nick,
            alvo,
            motivo,
            cargoAntes,
            cargoDepois
        );

        res.json({
            msg: `${alvo} ${tipo === "promover" ? "promovido" : "rebaixado"} com sucesso.`
        });
    } catch (err) {
        console.log("==== ERRO ====");
        console.log(err.response?.status);
        console.log(JSON.stringify(err.response?.data || err.message, null, 2));

        res.json({ msg: "Erro ao processar." });
    }
}

app.post("/promover", precisaLogin, (req, res) =>
    processarMudanca("promover", req, res)
);

app.post("/rebaixar", precisaLogin, (req, res) =>
    processarMudanca("rebaixar", req, res)
);

app.post("/banir", precisaLogin, async (req, res) => {
    try {
        const permitido = await temCargoPermitido(req);

        if (!permitido) {
            return res.json({ msg: "Sem permissão no Discord." });
        }

        const { nick, alvo, motivo } = req.body;

        if (!motivo) {
            return res.json({ msg: "Motivo obrigatório." });
        }

        const adminUser = await pegarUsuarioRoblox(nick);
        const alvoUser = await pegarUsuarioRoblox(alvo);

        if (!adminUser || !alvoUser) {
            return res.json({ msg: "Usuário Roblox não encontrado." });
        }

        const adminGrupo = await pegarInfoGrupo(adminUser.id);
        const alvoGrupo = await pegarInfoGrupo(alvoUser.id);

        if (!adminGrupo || !alvoGrupo) {
            return res.json({ msg: "Admin ou alvo não está no grupo." });
        }

        if (adminGrupo.roleRank < RANK_GENERAL) {
            return res.json({
                msg: "Apenas General ou superior pode remover."
            });
        }

        if (
            adminGrupo.roleRank !== RANK_DONO &&
            adminGrupo.roleRank <= alvoGrupo.roleRank
        ) {
            return res.json({
                msg: "Você não pode remover alguém igual ou maior."
            });
        }

        const cargoAntes = `${alvoGrupo.roleName} | Rank ${alvoGrupo.roleRank}`;

        await removerDoGrupo(alvoUser.id);

        await enviarLog(
            adminGrupo.roleRank >= RANK_GENERAL ? "Exoneração" : "Remoção",
            nick,
            alvo,
            motivo,
            cargoAntes,
            "Removido do grupo"
        );

        res.json({
            msg: `${alvo} foi removido/exonerado com sucesso.`
        });
    } catch (err) {
        console.log("==== ERRO AO REMOVER ====");
        console.log(err.response?.status);
        console.log(JSON.stringify(err.response?.data || err.message, null, 2));

        res.json({ msg: "Erro ao remover/exonerar." });
    }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log("Servidor rodando na porta " + PORT);
});