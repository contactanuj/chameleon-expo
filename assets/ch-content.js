/*
 * ch-content.js — built-in topic library for The Chameleon.
 *
 * A topic = { id, name, type:'word'|'picture', category, items:[16] }.
 *   - 'word'    topics are the classic Topic Cards (16 words in a 4x4 grid).
 *   - 'picture' topics are the Picture Edition (16 emoji in a 4x4 grid).
 *
 * Picture topics use emoji so the whole game stays a single inlined HTML file
 * (no binary assets). Each cell is just a string, so a future "bundled
 * illustration" set can drop in by replacing the emoji with <img>/SVG markup —
 * the engine and UI treat a cell as opaque content either way.
 *
 * Custom topics created in-app are stored separately (localStorage) and merged
 * with this library by the UI; they carry `custom:true`.
 */
(function (root, factory) {
  var C = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = C;
  if (root) root.CH_CONTENT = C;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this), function () {
  'use strict';

  var CATEGORIES = {
    food:      'Food & Drink',
    nature:    'Nature & Animals',
    culture:   'Film & Music',
    sport:     'Sport',
    geography: 'Geography',
    people:    'People & Jobs',
    home:      'Home',
    travel:    'Travel',
    science:   'Science & Space',
    seasonal:  'Seasonal',
    places:    'Places & Buildings',
    everyday:  'Everyday Things'
  };

  function w(id, name, category, items) { return { id: id, name: name, type: 'word', category: category, items: items }; }
  function p(id, name, category, items) { return { id: id, name: name, type: 'picture', category: category, items: items }; }

  var TOPICS = [
    // ---- WORD topics (classic Topic Cards) ---------------------------------
    w('food', 'Food', 'food',
      ['Pizza', 'Pasta', 'Eggs', 'Sausage', 'Potatoes', 'Salad', 'Cheese', 'Ice Cream',
       'Fish', 'Soup', 'Fruit', 'Chocolate', 'Cake', 'Bread', 'Chicken', 'Beef']),
    w('animals', 'Animals', 'nature',
      ['Dog', 'Cat', 'Lion', 'Elephant', 'Tiger', 'Bear', 'Horse', 'Rabbit',
       'Monkey', 'Snake', 'Eagle', 'Shark', 'Wolf', 'Frog', 'Penguin', 'Kangaroo']),
    w('movies', 'Movies', 'culture',
      ['Titanic', 'Avatar', 'Jaws', 'Frozen', 'Gladiator', 'Rocky', 'Alien', 'Up',
       'Cars', 'Shrek', 'Joker', 'Batman', 'Inception', 'Grease', 'Matrix', 'Psycho']),
    w('sports', 'Sports', 'sport',
      ['Football', 'Tennis', 'Boxing', 'Golf', 'Cricket', 'Rugby', 'Hockey', 'Cycling',
       'Swimming', 'Skiing', 'Surfing', 'Bowling', 'Darts', 'Archery', 'Rowing', 'Karate']),
    w('countries', 'Countries', 'geography',
      ['France', 'Japan', 'Brazil', 'Egypt', 'Canada', 'India', 'Italy', 'Mexico',
       'Spain', 'China', 'Kenya', 'Norway', 'Greece', 'Cuba', 'Peru', 'Thailand']),
    w('jobs', 'Jobs', 'people',
      ['Doctor', 'Teacher', 'Chef', 'Pilot', 'Farmer', 'Lawyer', 'Actor', 'Nurse',
       'Plumber', 'Artist', 'Soldier', 'Judge', 'Barber', 'Waiter', 'Sailor', 'Dentist']),
    w('body', 'Body Parts', 'people',
      ['Head', 'Hand', 'Foot', 'Eye', 'Ear', 'Nose', 'Mouth', 'Arm',
       'Leg', 'Knee', 'Elbow', 'Shoulder', 'Finger', 'Tooth', 'Heart', 'Brain']),
    w('kitchen', 'In the Kitchen', 'home',
      ['Fork', 'Spoon', 'Knife', 'Plate', 'Cup', 'Kettle', 'Oven', 'Fridge',
       'Pan', 'Bowl', 'Toaster', 'Whisk', 'Sink', 'Blender', 'Microwave', 'Teapot']),
    w('transport', 'Transport', 'travel',
      ['Car', 'Bus', 'Train', 'Plane', 'Boat', 'Bicycle', 'Truck', 'Taxi',
       'Tram', 'Helicopter', 'Scooter', 'Ferry', 'Rocket', 'Submarine', 'Motorbike', 'Van']),
    w('music', 'Instruments', 'culture',
      ['Guitar', 'Piano', 'Drums', 'Violin', 'Trumpet', 'Flute', 'Saxophone', 'Cello',
       'Harp', 'Banjo', 'Tuba', 'Clarinet', 'Accordion', 'Microphone', 'Keyboard', 'Triangle']),
    w('weather', 'Weather', 'nature',
      ['Rain', 'Sun', 'Snow', 'Wind', 'Storm', 'Fog', 'Cloud', 'Lightning',
       'Rainbow', 'Hail', 'Thunder', 'Drought', 'Frost', 'Breeze', 'Tornado', 'Heatwave']),
    w('clothing', 'Clothing', 'people',
      ['Shirt', 'Trousers', 'Hat', 'Shoes', 'Socks', 'Jacket', 'Dress', 'Scarf',
       'Gloves', 'Belt', 'Tie', 'Coat', 'Skirt', 'Jeans', 'Sweater', 'Boots']),
    w('drinks', 'Drinks', 'food',
      ['Water', 'Coffee', 'Tea', 'Juice', 'Milk', 'Soda', 'Beer', 'Wine',
       'Lemonade', 'Smoothie', 'Cocoa', 'Cider', 'Whisky', 'Champagne', 'Milkshake', 'Espresso']),
    w('fruits', 'Fruits', 'food',
      ['Apple', 'Banana', 'Orange', 'Grape', 'Mango', 'Cherry', 'Peach', 'Lemon',
       'Pear', 'Pineapple', 'Strawberry', 'Watermelon', 'Kiwi', 'Plum', 'Coconut', 'Melon']),
    w('space', 'Space', 'science',
      ['Sun', 'Moon', 'Star', 'Planet', 'Comet', 'Galaxy', 'Rocket', 'Astronaut',
       'Asteroid', 'Satellite', 'Telescope', 'Mars', 'Saturn', 'Eclipse', 'Meteor', 'Orbit']),
    w('buildings', 'Buildings', 'places',
      ['Castle', 'Tower', 'Bridge', 'Church', 'Stadium', 'Lighthouse', 'Skyscraper', 'Barn',
       'Palace', 'Temple', 'Windmill', 'Cottage', 'Cabin', 'Mansion', 'Hut', 'Pyramid']),
    w('house', 'Around the House', 'home',
      ['Sofa', 'Bed', 'Table', 'Chair', 'Lamp', 'Mirror', 'Clock', 'Carpet',
       'Curtain', 'Cushion', 'Bookshelf', 'Wardrobe', 'Television', 'Door', 'Window', 'Vase']),
    w('school', 'School', 'people',
      ['Pencil', 'Eraser', 'Ruler', 'Book', 'Desk', 'Teacher', 'Bell', 'Backpack',
       'Crayon', 'Globe', 'Chalk', 'Notebook', 'Scissors', 'Glue', 'Calculator', 'Homework']),
    w('emotions', 'Emotions', 'people',
      ['Happy', 'Sad', 'Angry', 'Scared', 'Excited', 'Bored', 'Jealous', 'Proud',
       'Nervous', 'Calm', 'Surprised', 'Confused', 'Lonely', 'Grateful', 'Shy', 'Curious']),
    w('superheroes', 'Superheroes', 'culture',
      ['Batman', 'Superman', 'Spiderman', 'Hulk', 'Thor', 'Ironman', 'Flash', 'Wolverine',
       'Joker', 'Robin', 'Aquaman', 'Venom', 'Storm', 'Loki', 'Antman', 'Catwoman']),
    w('halloween', 'Halloween', 'seasonal',
      ['Ghost', 'Witch', 'Pumpkin', 'Vampire', 'Skeleton', 'Zombie', 'Spider', 'Bat',
       'Candy', 'Mummy', 'Werewolf', 'Cauldron', 'Broomstick', 'Cobweb', 'Tombstone', 'Costume']),
    w('christmas', 'Christmas', 'seasonal',
      ['Santa', 'Reindeer', 'Snowman', 'Present', 'Tree', 'Sleigh', 'Elf', 'Stocking',
       'Bauble', 'Tinsel', 'Carol', 'Turkey', 'Mistletoe', 'Cracker', 'Wreath', 'Star']),
    w('vegetables', 'Vegetables', 'food',
      ['Carrot', 'Potato', 'Onion', 'Tomato', 'Pepper', 'Broccoli', 'Spinach', 'Cucumber',
       'Pea', 'Corn', 'Mushroom', 'Cabbage', 'Pumpkin', 'Garlic', 'Lettuce', 'Celery']),
    w('breakfast', 'Breakfast', 'food',
      ['Toast', 'Cereal', 'Eggs', 'Bacon', 'Pancakes', 'Porridge', 'Croissant', 'Yogurt',
       'Coffee', 'Juice', 'Bagel', 'Sausage', 'Waffle', 'Jam', 'Granola', 'Muffin']),
    w('birds', 'Birds', 'nature',
      ['Robin', 'Sparrow', 'Owl', 'Parrot', 'Penguin', 'Eagle', 'Swan', 'Duck',
       'Pigeon', 'Crow', 'Peacock', 'Flamingo', 'Ostrich', 'Woodpecker', 'Seagull', 'Hummingbird']),
    w('bugs', 'Bugs', 'nature',
      ['Ant', 'Bee', 'Butterfly', 'Beetle', 'Fly', 'Mosquito', 'Grasshopper', 'Ladybug',
       'Dragonfly', 'Moth', 'Wasp', 'Caterpillar', 'Cockroach', 'Firefly', 'Snail', 'Worm']),
    w('landforms', 'Landscapes', 'geography',
      ['Mountain', 'Valley', 'River', 'Lake', 'Desert', 'Forest', 'Island', 'Beach',
       'Cliff', 'Cave', 'Volcano', 'Waterfall', 'Canyon', 'Glacier', 'Hill', 'Swamp']),
    w('mythical', 'Mythical Creatures', 'culture',
      ['Dragon', 'Unicorn', 'Mermaid', 'Phoenix', 'Griffin', 'Centaur', 'Goblin', 'Troll',
       'Fairy', 'Werewolf', 'Vampire', 'Yeti', 'Kraken', 'Cyclops', 'Pegasus', 'Minotaur']),
    w('genres', 'Music Genres', 'culture',
      ['Rock', 'Pop', 'Jazz', 'Blues', 'Classical', 'Country', 'Reggae', 'Rap',
       'Metal', 'Folk', 'Disco', 'Funk', 'Soul', 'Techno', 'Opera', 'Punk']),
    w('hobbies', 'Hobbies', 'people',
      ['Painting', 'Reading', 'Cooking', 'Gardening', 'Fishing', 'Knitting', 'Photography', 'Dancing',
       'Singing', 'Gaming', 'Hiking', 'Baking', 'Drawing', 'Chess', 'Pottery', 'Cycling']),
    w('accessories', 'Accessories', 'people',
      ['Watch', 'Belt', 'Hat', 'Scarf', 'Gloves', 'Ring', 'Necklace', 'Bracelet',
       'Earrings', 'Sunglasses', 'Tie', 'Wallet', 'Umbrella', 'Handbag', 'Brooch', 'Cufflinks']),
    w('tools', 'Tools', 'home',
      ['Hammer', 'Screwdriver', 'Wrench', 'Saw', 'Drill', 'Pliers', 'Nail', 'Screw',
       'Tape', 'Level', 'Chisel', 'Axe', 'Ladder', 'Shovel', 'Sandpaper', 'Clamp']),
    w('colours', 'Colours', 'everyday',
      ['Red', 'Blue', 'Green', 'Yellow', 'Orange', 'Purple', 'Pink', 'Brown',
       'Black', 'White', 'Grey', 'Turquoise', 'Maroon', 'Gold', 'Silver', 'Beige']),
    w('shapes', 'Shapes', 'everyday',
      ['Circle', 'Square', 'Triangle', 'Rectangle', 'Star', 'Heart', 'Diamond', 'Oval',
       'Pentagon', 'Hexagon', 'Cube', 'Sphere', 'Cone', 'Cylinder', 'Arrow', 'Cross']),
    w('flowers', 'Flowers', 'nature',
      ['Rose', 'Tulip', 'Daisy', 'Sunflower', 'Lily', 'Orchid', 'Daffodil', 'Poppy',
       'Violet', 'Lavender', 'Carnation', 'Iris', 'Bluebell', 'Peony', 'Dandelion', 'Marigold']),
    w('trees', 'Trees', 'nature',
      ['Oak', 'Pine', 'Maple', 'Birch', 'Willow', 'Palm', 'Cedar', 'Redwood',
       'Apple', 'Cherry', 'Elm', 'Bamboo', 'Spruce', 'Chestnut', 'Beech', 'Fir']),
    w('gemstones', 'Gemstones', 'everyday',
      ['Diamond', 'Ruby', 'Emerald', 'Sapphire', 'Pearl', 'Opal', 'Amethyst', 'Topaz',
       'Jade', 'Garnet', 'Turquoise', 'Onyx', 'Quartz', 'Amber', 'Crystal', 'Coral']),
    w('desserts', 'Desserts', 'food',
      ['Cake', 'Pie', 'Cookie', 'Brownie', 'Pudding', 'Custard', 'Trifle', 'Cheesecake',
       'Donut', 'Tart', 'Mousse', 'Sundae', 'Pancake', 'Eclair', 'Fudge', 'Macaron']),
    w('fastfood', 'Fast Food', 'food',
      ['Burger', 'Fries', 'Pizza', 'Hotdog', 'Nuggets', 'Taco', 'Burrito', 'Wrap',
       'Kebab', 'Milkshake', 'Donut', 'Nachos', 'Sub', 'Wings', 'Slushie', 'Popcorn']),
    w('dance', 'Dance Styles', 'culture',
      ['Ballet', 'Tango', 'Salsa', 'Waltz', 'Hiphop', 'Breakdance', 'Tap', 'Ballroom',
       'Flamenco', 'Jive', 'Samba', 'Twist', 'Disco', 'Swing', 'Foxtrot', 'Conga']),
    w('games', 'Games', 'culture',
      ['Chess', 'Checkers', 'Monopoly', 'Scrabble', 'Dominoes', 'Bingo', 'Charades', 'Jenga',
       'Sudoku', 'Crossword', 'Marbles', 'Hopscotch', 'Solitaire', 'Darts', 'Pool', 'Backgammon']),
    w('camping', 'Camping', 'travel',
      ['Tent', 'Campfire', 'Backpack', 'Torch', 'Compass', 'Marshmallow', 'Lantern', 'Rope',
       'Hammock', 'Cooler', 'Trail', 'Canteen', 'Map', 'Firewood', 'Whistle', 'Tarp']),
    w('bathroom', 'Bathroom', 'home',
      ['Toothbrush', 'Toothpaste', 'Soap', 'Towel', 'Shower', 'Bathtub', 'Sink', 'Mirror',
       'Toilet', 'Shampoo', 'Sponge', 'Razor', 'Comb', 'Plughole', 'Flannel', 'Scales']),
    w('office', 'Office', 'home',
      ['Desk', 'Computer', 'Printer', 'Stapler', 'Pen', 'Paper', 'Folder', 'Phone',
       'Monitor', 'Keyboard', 'Mouse', 'Calendar', 'Envelope', 'Highlighter', 'Notepad', 'Mug']),
    w('organs', 'Body Organs', 'science',
      ['Heart', 'Brain', 'Lungs', 'Liver', 'Kidney', 'Stomach', 'Intestine', 'Bladder',
       'Spleen', 'Pancreas', 'Skin', 'Muscle', 'Bone', 'Nerve', 'Vein', 'Artery']),
    w('garden', 'The Garden', 'home',
      ['Flower', 'Lawn', 'Hedge', 'Fence', 'Shed', 'Pond', 'Gnome', 'Wheelbarrow',
       'Spade', 'Hose', 'Compost', 'Greenhouse', 'Patio', 'Weeds', 'Bench', 'Trellis']),

    // ---- PICTURE topics (Picture Edition, emoji 4x4) -----------------------
    p('pic-animals', 'Animals', 'nature',
      ['🐘', '🐧', '🦁', '🐸', '🦊', '🐢', '🦅', '🐝',
       '🐙', '🐒', '🐳', '🦋', '🐍', '🦄', '🦩', '🦘']),
    p('pic-food', 'Food', 'food',
      ['🍕', '🍔', '🍟', '🧀', '🌭', '🍜', '🍣', '🥚',
       '🍲', '🥗', '🍫', '🍰', '🍞', '🍗', '🍦', '🥕']),
    p('pic-faces', 'Faces', 'people',
      ['😀', '😂', '😍', '😎', '😭', '😡', '😱', '😴',
       '🤔', '🤢', '🥳', '😇', '🤯', '😬', '🥺', '😈']),
    p('pic-nature', 'Nature & Weather', 'nature',
      ['☀️', '🌧️', '❄️', '🌈', '⚡', '🌪️', '🔥', '🌊',
       '🌙', '⭐', '🌵', '🌳', '🍂', '🌸', '🍄', '🌍']),
    p('pic-sports', 'Sports', 'sport',
      ['⚽', '🏀', '🏈', '⚾', '🎾', '🏐', '🏉', '🎱',
       '🏓', '🏸', '🥊', '⛳', '🏊', '🚴', '🏂', '🛹']),
    p('pic-transport', 'Transport', 'travel',
      ['🚗', '🚌', '🚂', '✈️', '🚁', '⛵', '🚀', '🚲',
       '🛵', '🚜', '🚓', '🚑', '🚒', '🛸', '🚤', '🏍️']),
    p('pic-sea', 'Sea Life', 'nature',
      ['🐠', '🐟', '🐡', '🦈', '🐙', '🦑', '🦀', '🦞',
       '🦐', '🐚', '🐬', '🐳', '🐋', '🐢', '🦭', '🎣']),
    p('pic-fruit', 'Fruits', 'food',
      ['🍎', '🍌', '🍊', '🍇', '🍓', '🍑', '🍒', '🥭',
       '🍍', '🥝', '🍉', '🍐', '🥥', '🍋', '🫐', '🍈'])
  ];

  // ---------------------------------------------------------------------------
  // Bot clue knowledge: per-topic, a pool of words a *knowing* player might say
  // for each cell (parallel to items). Bots draw clues from these, judge how
  // related a clue is to the secret (voting/guessing), and bluff as the Chameleon.
  // INVARIANT (asserted by the tests): no clue equals the secret itself or any
  // OTHER item in the same topic — otherwise a clue would point at the wrong cell.
  // Topics without an entry here are simply not offered when bots are playing.
  // ---------------------------------------------------------------------------
  var BOT_CLUES = {
    food: [
      ['slice','italian','pepperoni','dough','crust'],['italian','spaghetti','sauce','noodles','bolognese'],
      ['breakfast','shell','omelette','scramble','yolk'],['bbq','meat','banger','links','grill'],
      ['mash','fries','chips','spuds','roast'],['leaves','healthy','greens','bowl','dressing'],
      ['dairy','cheddar','melt','mouse','grate'],['cold','dessert','cone','scoop','sundae'],
      ['sea','batter','scales','fins','salmon'],['bowl','warm','spoon','broth','tomato'],
      ['healthy','sweet','basket','vitamin','fresh'],['sweet','cocoa','bar','brown','candy'],
      ['birthday','sweet','bake','icing','candle'],['loaf','toast','bakery','crust','dough'],
      ['farm','wings','cluck','nuggets','roast'],['steak','cow','burger','red','mince']
    ],
    animals: [
      ['bark','pet','loyal','bone','woof'],['meow','whiskers','purr','feline','mouse'],
      ['mane','roar','king','savanna','pride'],['trunk','big','tusks','grey','jungle'],
      ['stripes','jungle','roar','orange','big'],['cave','honey','growl','fur','hibernate'],
      ['gallop','mane','ride','stable','hooves'],['hop','carrot','ears','burrow','fluffy'],
      ['banana','swing','jungle','climb','tail'],['hiss','slither','venom','scales','coil'],
      ['fly','talons','nest','soar','beak'],['teeth','ocean','fin','jaws','predator'],
      ['howl','pack','fang','wild','moon'],['hop','pond','croak','green','lily'],
      ['ice','waddle','cold','tuxedo','antarctic'],['hop','pouch','australia','jump','joey']
    ],
    movies: [
      ['ship','iceberg','romance','sink','ocean'],['blue','pandora','james','3d','navi'],
      ['shark','beach','fin','ocean','fear'],['snow','elsa','ice','sister','sing'],
      ['rome','arena','sword','fight','emperor'],['boxing','balboa','fight','stairs','training'],
      ['space','scary','xenomorph','ship','egg'],['balloons','house','old','adventure','grump'],
      ['race','lightning','road','wheels','pixar'],['ogre','swamp','donkey','green','fairy'],
      ['clown','villain','laugh','gotham','heath'],['bat','gotham','hero','cape','dark'],
      ['dream','layers','spinning','top','heist'],['dance','fifties','sing','school','sandy'],
      ['red','pill','neo','simulation','code'],['shower','motel','knife','scary','hitchcock']
    ],
    sports: [
      ['goal','kick','pitch','ball','soccer'],['racket','court','serve','net','wimbledon'],
      ['gloves','ring','punch','fight','knockout'],['club','hole','swing','course','green'],
      ['bat','wicket','bowl','over','england'],['scrum','try','tackle','oval','ball'],
      ['stick','puck','ice','goal','rink'],['bike','pedal','tour','wheels','race'],
      ['pool','stroke','water','lane','dive'],['snow','slope','mountain','poles','downhill'],
      ['wave','board','ocean','beach','ride'],['pins','strike','lane','ball','alley'],
      ['bullseye','throw','pub','treble','aim'],['bow','arrow','target','aim','robin'],
      ['oar','boat','river','crew','stroke'],['kick','belt','dojo','chop','martial']
    ],
    countries: [
      ['paris','eiffel','wine','baguette','croissant'],['tokyo','sushi','samurai','anime','sakura'],
      ['samba','rio','carnival','football','amazon'],['pyramid','nile','pharaoh','desert','sphinx'],
      ['maple','hockey','moose','syrup','cold'],['curry','taj','spice','ganges','cricket'],
      ['pizza','rome','pasta','venice','colosseum'],['taco','sombrero','aztec','spicy','cactus'],
      ['bull','flamenco','paella','madrid','siesta'],['wall','dragon','panda','rice','beijing'],
      ['safari','savanna','marathon','lion','nairobi'],['fjord','viking','cold','aurora','ski'],
      ['olympus','ruins','feta','island','mythology'],['cigar','salsa','havana','rum','classic'],
      ['machu','llama','andes','inca','mountain'],['bangkok','beach','pad','temple','elephant']
    ],
    jobs: [
      ['hospital','patient','stethoscope','cure','white'],['school','class','lesson','board','students'],
      ['kitchen','cook','hat','restaurant','knife'],['plane','fly','cockpit','sky','captain'],
      ['field','crops','tractor','barn','harvest'],['court','case','law','suit','justice'],
      ['stage','film','role','fame','script'],['hospital','care','patient','scrubs','ward'],
      ['pipe','leak','wrench','water','fix'],['paint','canvas','brush','gallery','create'],
      ['army','war','gun','uniform','march'],['court','gavel','law','robe','verdict'],
      ['hair','cut','shave','scissors','shop'],['restaurant','serve','tray','order','tips'],
      ['ship','sea','navy','rope','anchor'],['teeth','drill','filling','chair','smile']
    ],
    body: [
      ['top','skull','hat','think','neck'],['fingers','palm','wave','shake','glove'],
      ['toes','shoe','kick','sole','walk'],['see','blink','vision','iris','lash'],
      ['hear','sound','lobe','listen','headphones'],['smell','sniff','nostril','face','sneeze'],
      ['lips','eat','talk','smile','kiss'],['muscle','wrist','hug','sleeve','bicep'],
      ['walk','thigh','run','trousers','shin'],['joint','bend','cap','kneel','hinge'],
      ['bend','joint','grease','point','funny'],['blade','carry','shrug','broad','neck'],
      ['ring','point','nail','thumb','knuckle'],['bite','smile','dentist','white','brush'],
      ['beat','love','pump','chest','valentine'],['think','smart','skull','mind','nerve']
    ],
    transport: [
      ['drive','road','wheels','engine','garage'],['stop','double','route','fare','passengers'],
      ['track','rail','station','carriage','platform'],['fly','sky','airport','wings','jet'],
      ['water','sail','float','river','deck'],['pedal','two','ride','chain','helmet'],
      ['lorry','big','cargo','haul','wheels'],['cab','fare','yellow','hail','driver'],
      ['rail','city','street','electric','cable'],['rotor','hover','blades','sky','chopper'],
      ['vespa','ride','small','kick','wheels'],['water','cross','passengers','dock','port'],
      ['space','launch','blast','fuel','nasa'],['underwater','deep','dive','navy','sonar'],
      ['ride','engine','helmet','fast','two'],['delivery','cargo','white','panel','move']
    ],
    fruits: [
      ['red','orchard','cider','pie','teacher'],['yellow','peel','monkey','bunch','curve'],
      ['citrus','juice','peel','round','vitamin'],['vine','wine','bunch','purple','raisin'],
      ['tropical','juicy','stone','sweet','yellow'],['red','stone','pie','small','pair'],
      ['fuzzy','stone','sweet','juicy','orchard'],['sour','yellow','juice','citrus','zest'],
      ['green','juicy','tree','shape','sweet'],['tropical','spiky','juice','hawaii','yellow'],
      ['red','seeds','jam','sweet','cream'],['summer','green','seeds','juicy','slice'],
      ['green','fuzzy','bird','seeds','tropical'],['purple','stone','sweet','juicy','dried'],
      ['tropical','milk','palm','hairy','white'],['green','juicy','summer','round','seeds']
    ],
    weather: [
      ['wet','umbrella','drops','puddle','pour'],['hot','bright','shine','summer','sky'],
      ['cold','white','flakes','winter','ski'],['blow','gust','gale','kite','air'],
      ['dark','gale','rage','rough','brewing'],['mist','grey','thick','low','hazy'],
      ['sky','grey','fluffy','float','cover'],['flash','bolt','strike','electric','zap'],
      ['colours','arc','sky','pot','gold'],['ice','balls','pellets','cold','hard'],
      ['boom','loud','rumble','clap','sky'],['dry','parched','hot','crack','desert'],
      ['cold','ice','white','morning','bite'],['gentle','cool','light','air','soft'],
      ['twister','spin','funnel','destroy','swirl'],['hot','summer','sweat','scorch','bake']
    ],
    kitchen: [
      ['prongs','eat','tines','cutlery','spear'],['scoop','soup','stir','round','dessert'],
      ['cut','sharp','blade','slice','chop'],['round','dish','dinner','flat','china'],
      ['drink','handle','tea','mug','hold'],['boil','water','steam','whistle','spout'],
      ['bake','hot','roast','door','gas'],['cold','milk','chill','magnets','food'],
      ['fry','handle','nonstick','sizzle','flat'],['round','cereal','deep','mixing','soup'],
      ['bread','pop','slots','crispy','browning'],['beat','eggs','wire','mix','balloon'],
      ['wash','tap','drain','dishes','basin'],['smoothie','blend','jug','puree','whir'],
      ['heat','beep','ping','fast','reheat'],['tea','pour','spout','brew','china']
    ],
    'pic-animals': [
      ['trunk','big','grey','tusks','jungle'],['ice','cold','waddle','tuxedo','antarctic'],
      ['mane','roar','king','savanna','pride'],['hop','pond','croak','green','lily'],
      ['orange','sly','cunning','tail','den'],['shell','slow','sea','green','hide'],
      ['fly','talons','soar','beak','nest'],['buzz','honey','sting','yellow','hive'],
      ['tentacles','eight','ocean','ink','sucker'],['banana','swing','jungle','climb','tail'],
      ['ocean','big','spout','blue','mammal'],['wings','colourful','flutter','cocoon','garden'],
      ['hiss','slither','venom','scales','coil'],['horn','magic','myth','rainbow','sparkle'],
      ['pink','leg','wade','tropical','stand'],['hop','pouch','australia','jump','joey']
    ],
    'pic-food': [
      ['cheese','slice','italian','pepperoni','dough'],['beef','bun','fast','patty','fries'],
      ['chips','salt','potato','fast','ketchup'],['dairy','cheddar','melt','mouse','grate'],
      ['sausage','bun','mustard','stadium','link'],['ramen','slurp','asian','bowl','chopsticks'],
      ['rice','fish','japan','raw','roll'],['shell','breakfast','omelette','scramble','yolk'],
      ['pot','warm','hearty','broth','simmer'],['leaves','healthy','greens','bowl','dressing'],
      ['sweet','cocoa','bar','brown','candy'],['birthday','sweet','slice','icing','bake'],
      ['loaf','toast','bakery','crust','dough'],['leg','farm','roast','drumstick','wing'],
      ['cold','cone','scoop','sweet','summer'],['orange','rabbit','veg','crunch','root']
    ],
    music: [
      ['strings','strum','rock','electric','chord'],['keys','grand','black','white','classical'],
      ['beat','sticks','kit','rhythm','bang'],['bow','strings','orchestra','fiddle','classical'],
      ['brass','blow','jazz','fanfare','valves'],['wind','woodwind','blow','silver','high'],
      ['jazz','brass','reed','blow','smooth'],['bow','large','strings','low','orchestra'],
      ['strings','pluck','angel','large','golden'],['country','twang','strings','bluegrass','round'],
      ['brass','big','low','oompah','heavy'],['reed','woodwind','black','blow','jazz'],
      ['squeeze','bellows','folk','buttons','polka'],['sing','amplify','stage','stand','voice'],
      ['electric','keys','synth','play','plug'],['ting','metal','small','percussion','ring']
    ],
    clothing: [
      ['collar','button','top','sleeve','cotton'],['legs','pants','waist','pockets','formal'],
      ['head','cap','brim','top','wear'],['feet','laces','pair','sole','walk'],
      ['feet','pair','ankle','wool','warm'],['zip','warm','outer','sleeves','light'],
      ['gown','elegant','women','frock','party'],['neck','warm','wrap','wool','winter'],
      ['hands','fingers','warm','pair','mittens'],['waist','buckle','leather','hold','loop'],
      ['neck','knot','formal','suit','silk'],['warm','heavy','outer','winter','long'],
      ['women','knee','pleated','twirl','short'],['denim','blue','casual','pockets','rivets'],
      ['wool','jumper','warm','knit','cosy'],['feet','leather','tall','mud','ankle']
    ],
    drinks: [
      ['clear','thirst','tap','plain','fresh'],['beans','hot','caffeine','mug','morning'],
      ['leaves','hot','cup','brew','english'],['orange','fruit','fresh','glass','squeeze'],
      ['cow','white','dairy','calcium','carton'],['fizzy','can','bubbles','sugary','pop'],
      ['pint','pub','hops','lager','foam'],['grape','red','glass','vineyard','cork'],
      ['lemon','fizzy','sour','summer','refresh'],['blend','fruit','thick','healthy','straw'],
      ['chocolate','hot','warm','winter','mug'],['apple','fermented','pub','autumn','fizzy'],
      ['scotch','spirit','neat','barrel','strong'],['bubbles','celebrate','fizz','france','toast'],
      ['thick','sweet','blend','straw','diner'],['shot','strong','italian','small','bitter']
    ],
    space: [
      ['hot','bright','yellow','solar','day'],['night','crater','lunar','glow','phases'],
      ['twinkle','bright','distant','night','shine'],['round','world','gas','sphere','alien'],
      ['tail','ice','streak','fly','halley'],['stars','spiral','milky','vast','cluster'],
      ['launch','blast','fuel','space','nasa'],['suit','space','helmet','float','spacewalk'],
      ['rock','belt','space','crash','lump'],['signal','dish','gps','communication','beep'],
      ['lens','look','zoom','observe','hubble'],['red','rover','rusty','alien','war'],
      ['rings','gas','giant','halo','banded'],['shadow','dark','block','rare','total'],
      ['shower','streak','fall','burn','shooting'],['circle','path','revolve','loop','around']
    ],
    buildings: [
      ['moat','knight','royal','fortress','medieval'],['tall','lean','clock','spire','top'],
      ['river','cross','span','arch','suspension'],['cross','bells','pray','steeple','sunday'],
      ['crowd','sport','seats','arena','roar'],['beam','coast','ships','rocks','spiral'],
      ['tall','city','glass','storeys','lift'],['farm','hay','animals','red','rural'],
      ['king','grand','royal','throne','opulent'],['pray','ancient','monk','sacred','columns'],
      ['blades','wind','dutch','grind','turn'],['small','cosy','country','thatched','quaint'],
      ['wood','logs','forest','retreat','rustic'],['huge','rich','grand','sprawling','estate'],
      ['tiny','simple','mud','straw','basic'],['egypt','triangle','pharaoh','ancient','stone']
    ],
    house: [
      ['couch','sit','lounge','comfy','settee'],['sleep','pillow','mattress','duvet','rest'],
      ['legs','dine','surface','wood','eat'],['sit','legs','seat','back','stool'],
      ['light','bulb','shade','bedside','glow'],['reflect','glass','look','frame','vanity'],
      ['time','tick','hands','wall','alarm'],['floor','soft','rug','woven','vacuum'],
      ['drape','hang','fabric','pull','blinds'],['soft','pad','plump','square','comfy'],
      ['books','shelves','read','wood','store'],['clothes','hang','closet','narnia','oak'],
      ['screen','watch','remote','channels','box'],['open','handle','knock','wood','hinge'],
      ['glass','view','pane','open','sill'],['flowers','round','ceramic','display','ornate']
    ],
    school: [
      ['write','lead','sharp','hb','graphite'],['rub','mistake','rubber','pink','remove'],
      ['measure','straight','lines','cm','inches'],['read','pages','story','library','cover'],
      ['sit','write','drawer','wood','study'],['lesson','class','marks','board','explain'],
      ['ring','break','end','sound','chime'],['carry','straps','bag','shoulders','pack'],
      ['colour','wax','draw','kids','bright'],['world','spin','countries','round','map'],
      ['board','white','dust','write','blackboard'],['pages','write','lined','jot','pad'],
      ['cut','sharp','blades','snip','paper'],['stick','paste','bond','sticky','tube'],
      ['numbers','sum','buttons','maths','count'],['assignment','study','due','tasks','evening']
    ],
    emotions: [
      ['smile','joy','glad','cheer','sunny'],['cry','tears','down','blue','gloomy'],
      ['mad','rage','fury','red','steam'],['fear','fright','shiver','hide','spooked'],
      ['thrill','eager','buzz','hyper','keen'],['dull','yawn','meh','restless','nothing'],
      ['envy','covet','green','resent','want'],['achieve','beam','boast','accomplish','pride'],
      ['anxious','jitter','sweat','worry','edge'],['relaxed','peace','serene','chill','still'],
      ['shock','gasp','wow','sudden','startled'],['puzzled','lost','huh','muddle','unclear'],
      ['alone','isolated','solo','empty','longing'],['thankful','appreciate','blessed','thanks','gratitude'],
      ['timid','blush','quiet','reserved','bashful'],['wonder','nosy','explore','question','intrigue']
    ],
    superheroes: [
      ['bat','gotham','dark','cape','bruce'],['krypton','cape','fly','steel','clark'],
      ['web','swing','spider','peter','wallcrawler'],['green','smash','angry','big','rage'],
      ['hammer','thunder','asgard','god','mjolnir'],['suit','tony','armour','rich','stark'],
      ['fast','speed','run','lightning','scarlet'],['claws','adamantium','logan','mutant','healing'],
      ['clown','laugh','chaos','purple','cards'],['sidekick','boy','wonder','partner','bird'],
      ['ocean','atlantis','trident','fish','swim'],['symbiote','black','tongue','alien','eddie'],
      ['weather','mutant','lightning','africa','white'],['trickster','mischief','asgard','horns','brother'],
      ['shrink','tiny','ant','scott','small'],['cat','whip','burglar','selina','claws']
    ],
    halloween: [
      ['boo','spooky','white','float','haunt'],['spell','cackle','warts','green','hag'],
      ['orange','carve','lantern','jack','gourd'],['fangs','blood','bite','dracula','coffin'],
      ['bones','skull','rattle','white','ribs'],['undead','brains','shuffle','rotting','groan'],
      ['web','legs','eight','creepy','crawl'],['wings','cave','night','fly','flap'],
      ['sweet','treat','sugar','wrapper','bucket'],['wrapped','bandages','egypt','tomb','curse'],
      ['moon','fur','howl','transform','beast'],['bubble','brew','pot','potion','boil'],
      ['sweep','bristles','ride','wooden','straw'],['dusty','sticky','corner','threads','old'],
      ['grave','rip','stone','epitaph','cemetery'],['dressup','disguise','outfit','mask','pretend']
    ],
    christmas: [
      ['claus','beard','jolly','chimney','sack'],['antlers','rudolph','nose','hooves','fly'],
      ['frosty','carrot','coal','melt','build'],['gift','wrap','box','ribbon','surprise'],
      ['pine','fir','needles','lights','green'],['ride','snow','bells','glide','runners'],
      ['helper','pointy','workshop','small','shelf'],['hang','fireplace','fill','sock','hung'],
      ['round','shiny','hang','ornament','glass'],['shiny','sparkle','drape','silver','strands'],
      ['sing','song','choir','door','hymn'],['roast','dinner','bird','stuffing','feast'],
      ['kiss','hang','berry','sprig','doorway'],['pull','bang','party','joke','snap'],
      ['door','holly','circle','hang','festive'],['top','point','shine','bright','bethlehem']
    ],
    'pic-faces': [
      ['smile','happy','grin','teeth','cheer'],['laugh','tears','funny','lol','hilarious'],
      ['love','adore','crush','smitten','hearts'],['sunglasses','cool','swag','chill','slick'],
      ['cry','bawl','tears','upset','wail'],['rage','mad','fury','red','steam'],
      ['shock','fear','scream','horror','gasp'],['sleep','snore','tired','zzz','nap'],
      ['ponder','hmm','wonder','chin','consider'],['nausea','ill','green','queasy','sick'],
      ['celebrate','party','hat','confetti','woohoo'],['halo','innocent','sweet','good','wings'],
      ['explode','shock','wow','amazed','boom'],['awkward','cringe','teeth','eek','tense'],
      ['beg','puppy','please','cute','sad'],['evil','horns','mischief','naughty','purple']
    ],
    'pic-nature': [
      ['hot','bright','shine','day','solar'],['wet','drops','umbrella','cloud','pour'],
      ['cold','white','winter','unique','flake'],['colours','arc','sky','pot','gold'],
      ['bolt','flash','strike','electric','zap'],['twister','spin','funnel','destroy','swirl'],
      ['hot','flame','burn','blaze','smoke'],['ocean','surf','crash','water','big'],
      ['night','crescent','glow','lunar','sky'],['twinkle','shine','night','bright','point'],
      ['desert','spiky','dry','green','prickly'],['leaves','trunk','branches','green','shade'],
      ['autumn','fall','brown','crunch','rake'],['pink','flower','spring','petals','bloom'],
      ['fungus','red','spots','forest','toadstool'],['globe','world','planet','blue','home']
    ],
    'pic-sports': [
      ['goal','kick','pitch','round','net'],['hoop','dunk','dribble','court','orange'],
      ['tackle','touchdown','oval','helmet','yards'],['bat','pitch','diamond','home','mitt'],
      ['racket','serve','court','net','bounce'],['net','spike','beach','serve','dig'],
      ['scrum','oval','tackle','try','mud'],['pool','cue','eight','table','pocket'],
      ['paddle','table','bounce','small','fast'],['shuttle','racket','net','light','smash'],
      ['gloves','punch','ring','fight','knockout'],['hole','club','swing','green','flag'],
      ['pool','stroke','water','lane','dive'],['bike','pedal','wheels','tour','race'],
      ['snow','slope','jump','mountain','board'],['tricks','ollie','wheels','ramp','grind']
    ],
    'pic-transport': [
      ['drive','road','wheels','engine','garage'],['stop','route','passengers','double','fare'],
      ['track','steam','station','carriage','chug'],['fly','sky','wings','airport','jet'],
      ['rotor','hover','blades','chopper','sky'],['sail','wind','water','mast','float'],
      ['launch','space','blast','fuel','nasa'],['pedal','chain','ride','helmet','two'],
      ['vespa','ride','small','zip','wheels'],['farm','plough','field','slow','big'],
      ['siren','cop','chase','blue','law'],['siren','medic','emergency','hospital','rescue'],
      ['siren','fire','ladder','red','hose'],['alien','saucer','space','hover','abduct'],
      ['fast','water','wake','motor','spray'],['ride','engine','helmet','fast','roar']
    ],
    'pic-sea': [
      ['colourful','reef','swim','scales','fins'],['swim','scales','fins','water','gills'],
      ['spiky','inflate','puff','balloon','poison'],['teeth','fin','jaws','predator','hunt'],
      ['tentacles','eight','ink','sucker','arms'],['tentacles','ink','long','calamari','deep'],
      ['claws','shell','sideways','pinch','beach'],['claws','red','shell','tail','boil'],
      ['small','pink','prawn','curl','tiny'],['spiral','beach','ocean','conch','hermit'],
      ['smart','jump','flips','grey','friendly'],['spout','big','blue','ocean','blow'],
      ['huge','mammal','deep','blue','song'],['shell','slow','sea','green','flippers'],
      ['bark','flippers','blubber','pup','slippery'],['rod','hook','bait','catch','angler']
    ],
    'pic-fruit': [
      ['red','orchard','cider','pie','crunch'],['yellow','peel','monkey','bunch','curve'],
      ['citrus','juice','peel','round','segments'],['bunch','vine','wine','purple','raisin'],
      ['red','seeds','jam','sweet','cream'],['fuzzy','stone','juicy','sweet','orchard'],
      ['red','stone','pair','pie','small'],['tropical','juicy','stone','yellow','sweet'],
      ['spiky','tropical','juice','hawaii','crown'],['green','fuzzy','seeds','slice','tangy'],
      ['summer','seeds','juicy','slice','rind'],['green','juicy','tree','shape','grainy'],
      ['tropical','milk','palm','hairy','white'],['sour','yellow','juice','zest','tart'],
      ['tiny','blue','antioxidant','muffin','sweet'],['green','juicy','summer','round','sweet']
    ],
    vegetables: [
      ['orange','rabbit','root','crunch','vitamin'],['spud','mash','chips','brown','fries'],
      ['layers','cry','tears','bulb','smelly'],['red','salad','ketchup','round','juicy'],
      ['spicy','bell','hot','red','green'],['green','tree','florets','healthy','steam'],
      ['green','leafy','popeye','iron','salad'],['green','cool','salad','long','slice'],
      ['green','pod','small','round','frozen'],['yellow','cob','kernels','pop','field'],
      ['fungus','cap','forest','button','stalk'],['leafy','green','slaw','round','boil'],
      ['orange','carve','autumn','gourd','seeds'],['clove','smelly','breath','bulb','vampire'],
      ['leafy','salad','crisp','green','iceberg'],['stalk','crunch','green','sticks','soup']
    ],
    breakfast: [
      ['bread','butter','crispy','grill','rack'],['bowl','milk','crunchy','flakes','box'],
      ['shell','scramble','fried','yolk','poached'],['pig','sizzle','rashers','crispy','salty'],
      ['flip','syrup','stack','batter','fluffy'],['oats','warm','creamy','spoon','bland'],
      ['french','flaky','buttery','crescent','pastry'],['creamy','pot','fruit','spoon','probiotic'],
      ['beans','hot','caffeine','mug','wake'],['orange','fresh','glass','squeeze','citrus'],
      ['ring','hole','dough','chewy','cream'],['meat','banger','link','grill','pork'],
      ['grid','syrup','squares','iron','crispy'],['spread','fruit','sweet','sticky','jar'],
      ['oats','clusters','nuts','healthy','crunchy'],['cake','blueberry','baked','top','sweet']
    ],
    birds: [
      ['red','breast','garden','christmas','small'],['small','brown','common','chirp','garden'],
      ['hoot','night','wise','twit','nocturnal'],['colourful','talk','tropical','perch','mimic'],
      ['ice','waddle','cold','tuxedo','antarctic'],['soar','talons','majestic','beak','nest'],
      ['white','graceful','lake','neck','elegant'],['quack','pond','waddle','webbed','mallard'],
      ['city','grey','coo','statue','homing'],['black','caw','clever','scarecrow','murder'],
      ['feathers','fan','blue','display','proud'],['pink','leg','wade','tropical','stand'],
      ['tall','fast','run','sand','flightless'],['peck','tree','drum','hole','beak'],
      ['squawk','chips','coast','white','noisy'],['tiny','hover','nectar','fast','dart']
    ],
    bugs: [
      ['colony','tiny','queen','hill','march'],['buzz','honey','sting','yellow','hive'],
      ['wings','colourful','flutter','cocoon','garden'],['shell','black','crawl','hard','scarab'],
      ['buzz','annoying','swat','pest','wings'],['bite','itch','blood','whine','malaria'],
      ['jump','green','hop','chirp','legs'],['red','spots','lucky','round','dotty'],
      ['wings','pond','hover','darting','iridescent'],['light','dull','night','flutter','wool'],
      ['sting','yellow','angry','nest','picnic'],['crawl','leaf','fuzzy','munch','larva'],
      ['scuttle','kitchen','pest','survive','brown'],['glow','light','night','flash','twinkle'],
      ['slow','shell','slime','trail','garden'],['wriggle','soil','long','pink','dig']
    ],
    landforms: [
      ['peak','climb','summit','high','snow'],['low','green','between','dip','dale'],
      ['flow','water','bank','stream','current'],['still','water','calm','shore','fresh'],
      ['dry','sand','hot','dunes','cactus'],['trees','woods','green','dense','wildlife'],
      ['surrounded','sea','tropical','isolated','shore'],['sand','waves','sea','sunbathe','shells'],
      ['edge','steep','drop','rock','height'],['dark','underground','bats','stalactite','hollow'],
      ['lava','erupt','magma','ash','crater'],['cascade','falls','plunge','spray','rapids'],
      ['gorge','deep','carved','walls','vast'],['ice','slow','frozen','blue','crevasse'],
      ['slope','gentle','mound','roll','climb'],['muddy','marsh','boggy','wet','alligator']
    ],
    mythical: [
      ['fire','scales','wings','breath','lair'],['horn','rainbow','magic','white','pony'],
      ['tail','sea','siren','scales','swim'],['fire','reborn','ashes','rise','flame'],
      ['eagle','lion','wings','beak','majestic'],['horse','man','archer','hooves','half'],
      ['green','sneaky','cave','gold','ugly'],['bridge','big','grumpy','stone','lumbering'],
      ['tiny','wings','dust','wand','sparkle'],['moon','fur','howl','transform','beast'],
      ['fangs','blood','bat','coffin','count'],['snow','abominable','mountain','hairy','footprints'],
      ['tentacles','sea','giant','ship','deep'],['eye','one','giant','cave','greek'],
      ['winged','horse','soar','white','sky'],['bull','maze','half','labyrinth','horns']
    ],
    genres: [
      ['guitar','loud','band','electric','roll'],['catchy','chart','mainstream','dance','star'],
      ['smooth','sax','improv','swing','club'],['sad','soulful','guitar','mississippi','slow'],
      ['orchestra','symphony','mozart','refined','strings'],['cowboy','guitar','twang','nashville','banjo'],
      ['jamaica','relaxed','marley','offbeat','dub'],['rhyme','beats','hiphop','flow','lyrics'],
      ['heavy','loud','scream','headbang','distortion'],['traditional','acoustic','story','simple','fiddle'],
      ['seventies','dance','glitter','groovy','ball'],['groove','bass','rhythm','funky','brass'],
      ['emotion','motown','smooth','heartfelt','voice'],['electronic','beat','synth','club','repetitive'],
      ['singing','dramatic','italian','stage','aria'],['rebellious','fast','raw','mohawk','anarchy']
    ],
    hobbies: [
      ['brush','canvas','colour','easel','art'],['book','pages','story','quiet','library'],
      ['kitchen','recipe','stove','taste','chef'],['plants','soil','weeds','flowers','trowel'],
      ['rod','bait','river','patience','hook'],['wool','needles','scarf','yarn','purl'],
      ['camera','lens','snap','capture','focus'],['move','music','rhythm','steps','twirl'],
      ['voice','song','tune','melody','karaoke'],['console','controller','screen','levels','play'],
      ['trail','boots','mountain','walk','backpack'],['oven','cake','flour','dough','sweet'],
      ['pencil','sketch','paper','doodle','lines'],['board','king','strategy','checkmate','pawns'],
      ['clay','wheel','mould','kiln','shape'],['bike','pedal','wheels','ride','helmet']
    ],
    accessories: [
      ['time','wrist','tick','strap','hands'],['waist','buckle','leather','hold','loop'],
      ['head','brim','cap','wear','top'],['neck','warm','wrap','wool','winter'],
      ['hands','fingers','warm','pair','mittens'],['finger','gold','marriage','band','jewel'],
      ['neck','chain','pendant','beads','jewel'],['wrist','bangle','charm','jewel','band'],
      ['ears','studs','dangle','pierce','pair'],['shades','sun','dark','cool','eyes'],
      ['neck','knot','formal','suit','silk'],['money','leather','pocket','cards','fold'],
      ['rain','shelter','fold','handle','brolly'],['purse','carry','strap','shoulder','fashion'],
      ['pin','decorative','lapel','antique','sparkle'],['shirt','sleeve','formal','pair','dress']
    ],
    tools: [
      ['bang','hit','claw','thumb','mallet'],['turn','flat','phillips','twist','handle'],
      ['tighten','bolt','grip','spanner','adjust'],['cut','teeth','wood','blade','jagged'],
      ['bore','hole','electric','bit','spin'],['grip','pinch','bend','wire','jaws'],
      ['metal','sharp','pin','point','head'],['thread','twist','spiral','fix','metal'],
      ['sticky','measure','roll','stick','adhesive'],['flat','bubble','straight','even','horizontal'],
      ['carve','wood','sharp','mallet','sculpt'],['chop','wood','blade','swing','lumberjack'],
      ['climb','rungs','tall','steps','reach'],['dig','snow','scoop','spade','earth'],
      ['rough','smooth','sand','grit','rub'],['hold','grip','tighten','vice','secure']
    ],
    colours: [
      ['blood','fire','stop','rose','anger'],['sky','sea','sad','cold','ocean'],
      ['grass','envy','nature','go','leaf'],['sun','banana','lemon','bright','cheese'],
      ['fruit','sunset','tiger','autumn','carrot'],['royal','grape','violet','plum','regal'],
      ['flamingo','blossom','baby','candy','rosy'],['mud','chocolate','wood','earth','bear'],
      ['night','dark','coal','ink','mourning'],['snow','clean','pure','ghost','milk'],
      ['cloudy','dull','elephant','stone','ash'],['tropical','gem','lagoon','teal','aqua'],
      ['deep','wine','rich','brick','crimson'],['shiny','medal','treasure','metal','bling'],
      ['shiny','metal','medal','moon','coin'],['neutral','sand','plain','cream','pale']
    ],
    shapes: [
      ['round','ring','wheel','loop','ball'],['four','equal','box','even','block'],
      ['three','point','pyramid','peak','slice'],['oblong','four','long','door','sides'],
      ['five','points','sky','twinkle','gold'],['love','valentine','romance','beat','red'],
      ['gem','rhombus','sparkle','cards','facets'],['egg','stretched','ellipse','round','long'],
      ['five','sides','building','gon','defence'],['six','sides','honeycomb','bee','gon'],
      ['box','dice','sugar','solid','six'],['ball','globe','round','planet','orb'],
      ['ice','point','traffic','party','tip'],['tube','can','round','tall','roll'],
      ['point','direction','bow','sign','target'],['plus','religion','church','intersect','x']
    ],
    flowers: [
      ['red','thorns','romance','petals','valentine'],['dutch','spring','cup','holland','bulb'],
      ['white','chain','simple','meadow','petals'],['tall','yellow','seeds','sun','bright'],
      ['white','pond','trumpet','elegant','funeral'],['exotic','delicate','tropical','pot','rare'],
      ['yellow','spring','trumpet','easter','bulb'],['red','remembrance','field','seeds','paper'],
      ['purple','small','shrinking','sweet','woodland'],['purple','scent','calming','fields','herb'],
      ['frilly','buttonhole','pink','ruffled','mothers'],['purple','eye','sword','tall','bearded'],
      ['blue','woodland','carpet','spring','bell'],['fluffy','pink','lush','blousy','fragrant'],
      ['yellow','weed','puff','wish','clock'],['orange','golden','hardy','border','pungent']
    ],
    trees: [
      ['acorn','mighty','sturdy','english','gnarled'],['needles','cone','evergreen','sap','forest'],
      ['syrup','leaf','canada','red','autumn'],['white','bark','silver','slender','peeling'],
      ['weeping','droopy','riverbank','graceful','bendy'],['tropical','beach','coconut','fronds','swaying'],
      ['aromatic','evergreen','sturdy','chest','lebanon'],['giant','tall','ancient','california','towering'],
      ['orchard','fruit','blossom','cider','picking'],['blossom','pink','japan','fruit','stone'],
      ['dutch','tall','shady','avenue','disease'],['fast','panda','asian','hollow','cane'],
      ['christmas','conifer','needles','festive','norway'],['conker','roasted','prickly','autumn','brown'],
      ['smooth','copper','hedge','nuts','woodland'],['christmas','conifer','needles','pointed','douglas']
    ],
    gemstones: [
      ['sparkle','hard','clear','ring','carbon'],['red','precious','deep','slippers','birthstone'],
      ['green','precious','city','lush','colombia'],['blue','precious','royal','deep','star'],
      ['white','oyster','lustre','round','necklace'],['iridescent','milky','fiery','australian','shimmer'],
      ['purple','violet','geode','february','calming'],['yellow','golden','clear','november','warm'],
      ['green','chinese','carved','lucky','smooth'],['red','dark','january','deep','crystalline'],
      ['blue','green','native','sky','banded'],['black','glossy','banded','smooth','dark'],
      ['clear','common','pointed','milky','rock'],['orange','fossil','resin','ancient','insect'],
      ['clear','facets','ball','glassy','prism'],['pink','reef','ocean','branching','organic']
    ],
    desserts: [
      ['birthday','sponge','icing','candles','slice'],['pastry','filling','crust','apple','slice'],
      ['biscuit','chip','round','crumbly','baked'],['chocolate','fudgy','square','gooey','walnut'],
      ['warm','spoon','sticky','steamed','bowl'],['yellow','creamy','pour','vanilla','lumpy'],
      ['layers','sherry','jelly','sponge','bowl'],['creamy','base','baked','rich','berry'],
      ['ring','hole','glazed','fried','sprinkles'],['pastry','filling','fruit','glazed','shallow'],
      ['airy','light','whipped','chocolate','fluffy'],['scoop','sauce','cherry','glass','layered'],
      ['flip','syrup','thin','batter','lemon'],['choux','cream','chocolate','long','filled'],
      ['sweet','crumbly','dense','vanilla','squares'],['french','colourful','almond','sandwich','delicate']
    ],
    fastfood: [
      ['bun','patty','beef','cheese','grill'],['chips','salt','fried','potato','ketchup'],
      ['slice','cheese','pepperoni','dough','italian'],['sausage','bun','mustard','stadium','relish'],
      ['chicken','breaded','dip','bite','golden'],['shell','mexican','crunchy','filling','salsa'],
      ['wrapped','beans','rice','rolled','mexican'],['rolled','tortilla','filled','healthy','handheld'],
      ['skewer','meat','pitta','lamb','late'],['thick','straw','creamy','blended','sweet'],
      ['ring','glazed','sweet','fried','sprinkles'],['chips','cheese','loaded','sharing','salsa'],
      ['long','roll','filled','footlong','sandwich'],['chicken','spicy','sticky','buffalo','bones'],
      ['icy','frozen','slurp','colourful','straw'],['kernels','buttery','cinema','pop','salty']
    ],
    dance: [
      ['tutu','pointe','graceful','classical','pirouette'],['argentine','passionate','dramatic','rose','close'],
      ['latin','spicy','cuban','hips','partner'],['viennese','elegant','threebeat','spinning','formal'],
      ['street','urban','beats','baggy','freestyle'],['spin','floor','head','acrobatic','battle'],
      ['shoes','clatter','rhythm','metal','broadway'],['formal','partner','gliding','gowns','competition'],
      ['spanish','stomp','guitar','fiery','ruffles'],['lively','fifties','bouncy','rocknroll','energetic'],
      ['brazilian','carnival','rhythmic','hips','festive'],['sixties','chubby','hips','knees','craze'],
      ['seventies','glitter','groovy','ball','floor'],['lindy','partner','throws','bouncy','retro'],
      ['smooth','gliding','elegant','slow','walking'],['line','chain','kick','party','brazilian']
    ],
    games: [
      ['king','board','strategy','checkmate','knights'],['draughts','jump','board','discs','crown'],
      ['property','money','board','dice','bankrupt'],['tiles','words','letters','board','score'],
      ['tiles','dots','topple','chain','match'],['numbers','balls','hall','dab','fullhouse'],
      ['act','mime','guess','silent','film'],['blocks','tower','pull','wobble','topple'],
      ['numbers','grid','logic','puzzle','nine'],['clues','grid','words','across','down'],
      ['glass','roll','flick','ring','collect'],['chalk','jump','squares','pavement','stone'],
      ['cards','alone','patience','deck','klondike'],['board','throw','bullseye','pub','treble'],
      ['cue','balls','table','pocket','eight'],['board','dice','counters','ancient','doubling']
    ],
    camping: [
      ['pitch','canvas','pegs','shelter','zip'],['flames','logs','warmth','embers','crackle'],
      ['straps','carry','rucksack','heavy','gear'],['beam','battery','light','handheld','flash'],
      ['north','needle','direction','bearing','navigate'],['toast','sticky','white','squishy','stick'],
      ['glow','hang','oil','gas','lamp'],['knot','tie','climb','coil','sturdy'],
      ['sway','hang','relax','net','trees'],['ice','drinks','box','keep','chilled'],
      ['path','hike','marked','follow','woods'],['water','flask','metal','bottle','refill'],
      ['fold','paper','route','terrain','legend'],['logs','chop','kindling','dry','stack'],
      ['blow','signal','loud','emergency','shrill'],['cover','waterproof','sheet','shelter','rig']
    ],
    bathroom: [
      ['bristles','teeth','brush','electric','handle'],['minty','tube','squeeze','foam','fluoride'],
      ['bubbles','wash','bar','lather','slippery'],['dry','fluffy','hang','cotton','wrap'],
      ['spray','wash','curtain','steam','head'],['soak','bubbles','fill','relax','taps'],
      ['basin','tap','wash','drain','plug'],['reflect','glass','steamy','vanity','look'],
      ['flush','seat','loo','cistern','roll'],['hair','lather','bottle','wash','suds'],
      ['squishy','absorb','scrub','holes','soft'],['shave','blade','sharp','stubble','glide'],
      ['hair','teeth','part','plastic','neat'],['drain','water','gurgle','hole','hair'],
      ['cloth','face','wipe','soft','damp'],['weigh','step','kilos','balance','dread']
    ],
    office: [
      ['surface','work','drawers','sit','wooden'],['screen','type','processor','boot','machine'],
      ['ink','toner','jam','print','whirr'],['staples','click','bind','jaws','fasten'],
      ['ink','write','click','blue','lid'],['sheet','white','write','ream','fold'],
      ['file','hold','tab','manila','organise'],['call','ring','dial','hold','line'],
      ['screen','display','pixels','glow','widescreen'],['keys','type','qwerty','tap','clack'],
      ['click','cursor','scroll','pad','wireless'],['dates','months','plan','wall','flip'],
      ['seal','stamp','letter','lick','post'],['yellow','mark','fluorescent','glow','neon'],
      ['jot','pages','lined','scribble','pad'],['coffee','handle','hot','tea','ceramic']
    ],
    organs: [
      ['pump','beat','blood','chest','love'],['think','skull','mind','neurons','smart'],
      ['breathe','air','oxygen','chest','pair'],['detox','large','filter','bile','regenerate'],
      ['filter','pair','bean','urine','waste'],['digest','acid','food','churn','belly'],
      ['long','gut','coiled','absorb','bowel'],['urine','store','balloon','empty','full'],
      ['filter','immune','small','blood','hidden'],['insulin','enzymes','sugar','gland','tucked'],
      ['cover','largest','pores','sweat','surface'],['flex','strong','fibre','contract','gym'],
      ['skeleton','hard','calcium','marrow','break'],['signal','impulse','electric','sense','wire'],
      ['blue','blood','carry','return','vessel'],['red','blood','pump','vessel','main']
    ],
    garden: [
      ['bloom','petals','colourful','bed','fragrant'],['grass','mow','green','stripes','turf'],
      ['trim','bushy','border','leafy','privet'],['panel','boundary','wooden','post','paint'],
      ['store','tools','wooden','roof','mower'],['water','fish','lily','still','frogs'],
      ['ornament','beard','hat','kitsch','fishing'],['push','single','load','tip','barrow'],
      ['dig','sharp','soil','handle','blade'],['water','coil','spray','reel','kink'],
      ['rot','heap','scraps','fertile','smelly'],['glass','warm','grow','tomatoes','humid'],
      ['paving','slabs','sit','outdoor','furniture'],['unwanted','pull','dandelion','invasive','spread'],
      ['seat','sit','wooden','rest','slats'],['climb','lattice','support','roses','wooden']
    ]
  };

  // index by id for quick lookup; attach bot clue pools to their topics
  var byId = {};
  TOPICS.forEach(function (t) { byId[t.id] = t; t.botClues = BOT_CLUES[t.id] || null; });

  // category ids that actually appear (for building filter UIs)
  function usedCategories() {
    var set = {};
    TOPICS.forEach(function (t) { set[t.category] = true; });
    return Object.keys(set);
  }

  return {
    CATEGORIES: CATEGORIES,
    TOPICS: TOPICS,
    byId: byId,
    usedCategories: usedCategories
  };
});
