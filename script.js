async function carregarCargos() {
    const select = document.getElementById("cargo");

    try {
        const res = await fetch("/cargos");
        const data = await res.json();

        select.innerHTML = `<option value="">Selecione o cargo</option>`;

        data.cargos.forEach(cargo => {
            const option = document.createElement("option");
            option.value = cargo.rank;
            option.textContent = `${cargo.name} | Rank: ${cargo.rank}`;
            select.appendChild(option);
        });

    } catch {
        select.innerHTML = `<option value="">Erro ao carregar cargos</option>`;
    }
}

async function carregarUsuario(inputId, avatarId, cargoId) {
    const nick = document.getElementById(inputId).value.trim();

    if (!nick) return;

    try {
        const res = await fetch("/usuario/" + nick);
        const data = await res.json();

        if (data.erro) {
            document.getElementById(cargoId).innerText = data.erro;
            document.getElementById(avatarId).src = "";
            return;
        }

        document.getElementById(avatarId).src = data.avatar;
        document.getElementById(cargoId).innerText =
            `${data.cargo} | Rank: ${data.rank}`;

    } catch {
        document.getElementById(cargoId).innerText = "Erro ao carregar.";
    }
}

document.getElementById("nick").addEventListener("input", () => {
    carregarUsuario("nick", "avatarAdmin", "cargoAdmin");
});

document.getElementById("alvo").addEventListener("input", () => {
    carregarUsuario("alvo", "avatarAlvo", "cargoAlvo");
});

async function acao(tipo) {
    const nick = document.getElementById("nick").value.trim();
    const alvo = document.getElementById("alvo").value.trim();
    const cargo = document.getElementById("cargo").value;
    const motivo = document.getElementById("motivo").value.trim();

    if (!nick || !alvo || !motivo) {
        document.getElementById("resposta").innerText =
            "Preencha todos os campos.";
        return;
    }

    if ((tipo === "promover" || tipo === "rebaixar") && !cargo) {
        document.getElementById("resposta").innerText =
            "Selecione um cargo.";
        return;
    }

    document.getElementById("resposta").innerText = "Enviando...";

    try {
        const res = await fetch("/" + tipo, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                nick,
                alvo,
                cargo,
                motivo
            })
        });

        const data = await res.json();
        document.getElementById("resposta").innerText = data.msg;

    } catch {
        document.getElementById("resposta").innerText =
            "Erro ao enviar ação.";
    }
}

carregarCargos();