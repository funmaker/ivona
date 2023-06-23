
const form = document.getElementById("form");
const audio = document.getElementById("audio");

form.addEventListener("submit", ev => {
  ev.preventDefault();
  const formData = new FormData(ev.currentTarget);
  
  const voice = formData.get("voice");
  const text = formData.get("text");
  
  audio.src = `/tts?voice=${encodeURIComponent(voice)}&text=${encodeURIComponent(text)}`;
});
