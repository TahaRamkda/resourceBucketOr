

var numberOfancher = document.querySelectorAll(".conh").length;

for (var i = 0; i < numberOfancher; i++) {
    document.querySelectorAll(".conh")[i].addEventListener("click", function () {
         document.querySelectorAll(".conh").forEach(function (a) {
            a.classList.remove("clicked");
        });
        this.classList.add("clicked");
    });
}

function changebox(boxNumber){

    const boxId = `box${boxNumber}`;
    const elmnt = document.getElementById(boxId); 

    if(elmnt){
        elmnt.scrollIntoView({behavior: "smooth",  block:"center"});
    }
}
