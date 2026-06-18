function acao(tipo) {
    const nick = document.getElementById("nick").value;
    const alvo = document.getElementById("alvo").value;
    const cargo = document.getElementById("cargo").value;
    const motivo = document.getElementById("motivo").value;

    document.getElementById("resposta").innerText =
        `${tipo} executado em ${alvo} com motivo: ${motivo}`;
}