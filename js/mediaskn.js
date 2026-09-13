
 $(document).ready(function() {
   var audioElement = document.createElement('audio');
   audioElement.setAttribute('src', 'media/new-voice.mp3');

   audioElement.addEventListener('ended', function() {
       this.play();
   }, false);


    $('body').click(function() {
       audioElement.play();

   });
});

 $(document).ready(function() {
   var audioElement = document.createElement('audio');
   audioElement.setAttribute('src', 'media/ndcjwsa.mp3');

   audioElement.addEventListener('ended', function() {
       this.play();
   }, false);
   

    $('body').click(function() {
       audioElement.play();

   });

});
