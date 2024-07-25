
document.addEventListener("DOMContentLoaded", function() {
    // Your existing code here
    var numberOfancher = document.querySelectorAll(".conh").length;

    for (var i = 0; i < numberOfancher; i++) {
        document.querySelectorAll(".conh")[i].addEventListener("click", function () {
            document.querySelectorAll(".conh").forEach(function (a) {
                a.classList.remove("click");
            });
            this.classList.add("click");
        });
    }
});


function changebox(boxNumber){

    const boxId = `box${boxNumber}`;
    const elmnt = document.getElementById(boxId); 

    if(elmnt){
        elmnt.scrollIntoView({behavior: "smooth",  block:"center"});
    }
}
