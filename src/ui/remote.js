import { $ } from "@sciter";
import { handler,view,isReasonableSize,msgbox,is_osx, is_linux, centerize, connecting } from "./common.js";
import { initializeFileTransfer, save_file_transfer_close_state } from "./file_transfer.js";
import { initializePortForward } from "./port_forward.js";
import { header } from "./header.js";

const body = document.body;
var cursor_img = $("img#cursor");
var last_key_time = 0;
var display_width = 0;
var display_height = 0;
var display_origin_x = 0;
var display_origin_y = 0;
var display_scale = 1;
export var keyboard_enabled = true; // server side
export var clipboard_enabled = true; // server side
export var audio_enabled = true; // server side

handler.is_port_forward = handler.xcall("is_port_forward");
handler.is_file_transfer = handler.xcall("is_file_transfer");

handler.setDisplay = function(x, y, w, h) {
    display_width = w;
    display_height = h;
    display_origin_x = x;
    display_origin_y = y;
    adaptDisplay();
}

export function adaptDisplay() {
    let w = display_width;
    let h = display_height;
    if (!w || !h) return;
    let style = handler.xcall("get_view_style");
    display_scale = 1.;
    let [sx, sy, sw, sh] = view.screenBox(view.state == Window.WINDOW_FULL_SCREEN ? "frame" : "workarea", "rectw");
    if (sw >= w && sh > h) {
        let hh = $("header").state.box("height", "border");
        let el = $("div#adjust-window");
        if (sh > h + hh && el) {
            el.style.setProperty("display","block");
            el = $("li#adjust-window");
            el.style.setProperty("display","block");
            el.on("click",function() {
                view.state = Window.WINDOW_SHOWN;
                let [x, y] = body.state.box("position", "border", "screen"); // TEST
                // extra for border
                let extra = 2;
                view.move(x, y, w + extra, h + hh + extra);
            })
        }
    }
    if (style != "original") {
        let bw = body.state.box("width", "border");
        let bh = body.state.box("height", "border");
        if (view.state == Window.WINDOW_FULL_SCREEN) {
            bw = sw;
            bh = sh;
        }
        if (bw > 0 && bh > 0) {
            // TEST del toFloat()
            let scale_x = bw / w;
            let scale_y = bh / h;
            let scale = scale_x < scale_y ? scale_x : scale_y;
            if ((scale > 1 && style == "stretch") ||
                (scale < 1 && style == "shrink")) {
                display_scale = scale;
                w = w * scale;
                h = h * scale;
            }
        }
    }
    handler.style.setProperty("width",w + "px");
    handler.style.setProperty("height",h + "px")
}

// https://sciter.com/event-handling/
// https://sciter.com/docs/content/sciter/Event.htm

var entered = false;

// TODO !
// var keymap = {};
// for (var (k, v) in Event) {
//     k = k + ""
//     if (k[0] == "V" && k[1] == "K") {
//         keymap[v] = k;
//     }
// }

// VK_ENTER = VK_RETURN
// somehow, handler.onKey and view.onKey not working
// function self.onKey(evt) {
//     last_key_time = getTime();
//     if (is_file_transfer || is_port_forward) return false;
//     if (!entered) return false;
//     if (!keyboard_enabled) return false;
//     switch (evt.type) {
//         case Event.KEY_DOWN:
//             handler.key_down_or_up(1, keymap[evt.keyCode] || "", evt.keyCode, evt.altKey,
//                 evt.ctrlKey, evt.shiftKey, evt.commandKey, evt.extendedKey);
//             if (is_osx && evt.commandKey) {
//                 handler.key_down_or_up(0, keymap[evt.keyCode] || "", evt.keyCode, evt.altKey,
//                     evt.ctrlKey, evt.shiftKey, evt.commandKey, evt.extendedKey);
//             }
//             break;
//         case Event.KEY_UP:
//             handler.key_down_or_up(0, keymap[evt.keyCode] || "", evt.keyCode, evt.altKey,
//                 evt.ctrlKey, evt.shiftKey, evt.commandKey, evt.extendedKey);
//             break;
//         case Event.KEY_CHAR:
//             // the keypress event is fired when the element receives character value. Event.keyCode is a UNICODE code point of the character
//             handler.key_down_or_up(2, "", evt.keyCode, evt.altKey,
//                 evt.ctrlKey, evt.shiftKey, evt.commandKey, evt.extendedKey);
//             break;
//         default:
//             return false;
//     }
//     return true;
// }

var wait_window_toolbar = false;
var last_mouse_mask;
var acc_wheel_delta_x = 0;
var acc_wheel_delta_y = 0;
var last_wheel_time = 0;
var inertia_velocity_x = 0;
var inertia_velocity_y = 0;
var acc_wheel_delta_x0 = 0;
var acc_wheel_delta_y0 = 0;
var total_wheel_time = 0;
var wheeling = false;
var dragging = false;

// https://stackoverflow.com/questions/5833399/calculating-scroll-inertia-momentum
function resetWheel() {
    acc_wheel_delta_x = 0;
    acc_wheel_delta_y = 0;
    last_wheel_time = 0;
    inertia_velocity_x = 0;
    inertia_velocity_y = 0;
    acc_wheel_delta_x0 = 0;
    acc_wheel_delta_y0 = 0;
    total_wheel_time = 0;
    wheeling = false;
}

var INERTIA_ACCELERATION = 30;

// not good, precision not enough to simulate accelation effect,
// seems have to use pixel based rather line based delta
function accWheel(v, is_x) {
    if (wheeling) return;
    var abs_v = Math.abs(v);
    var max_t = abs_v / INERTIA_ACCELERATION;
    for (var t = 0.1; t < max_t; t += 0.1) {
        var d = Math.round((abs_v - t * INERTIA_ACCELERATION / 2) * t).toInteger();
        if (d >= 1) {
            abs_v -= t * INERTIA_ACCELERATION;
            if (v < 0) {
                d = -d;
                v = -abs_v;
            } else {
                v = abs_v;
            }
            handler.xcall("send_mouse",3, is_x ? d : 0, !is_x ? d : 0, false, false, false, false);
            accWheel(v, is_x);
            break;
        }
    }
}

// // TODO
// handler.onMouse(evt)
// {
//     if (is_file_transfer || is_port_forward) return false;
//     if (view.windowState == View.WINDOW_FULL_SCREEN && !dragging) {
//         var dy = evt.y - scroll_body.scroll(#top);
//         if (dy <= 1) {
//             if (!wait_window_toolbar) {
//                 wait_window_toolbar = true;
//                 self.timer(300ms, function() {
//                     if (!wait_window_toolbar) return;
//                     var extra = 0;
//                     // workaround for stupid Sciter, without this, click
//                     // event not triggered on top part of buttons on toolbar
//                     if (is_osx) extra = 10; 
//                     if (view.windowState == View.WINDOW_FULL_SCREEN) {
//                         $(header).style.set {
//                           display: "block",
//                           padding: (2 * workarea_offset + extra) + "px 0 0 0",
//                         };
//                     }
//                     wait_window_toolbar = false;
//                 });
//             }
//         } else {
//             wait_window_toolbar = false;
//             var h = $(header).style;
//             if (dy > 20 && h#display != "none") {
//               h.set {
//                   display: "none",
//               };
//             }
//         } 
//     }
//     if (!got_mouse_control) {
//         if (Math.abs(evt.x - cur_local_x) > 12 || Math.abs(evt.y - cur_local_y) > 12) {
//             got_mouse_control = true;
//         } else {
//             return;
//         }
//     }
//     var mask = 0;
//     var wheel_delta_x;
//     var wheel_delta_y;
//     switch(evt.type) {
//       case Event.MOUSE_DOWN:
//         mask = 1;
//         dragging = true;
//         break; 
//       case Event.MOUSE_UP:
//         mask = 2;
//         dragging = false;
//         break;
//       case Event.MOUSE_MOVE:
//         if (cursor_img.style#display != "none" && keyboard_enabled) {
//             cursor_img.style#display = "none";
//             handler.style#cursor = '';
//         }
//         break;
//       case Event.MOUSE_WHEEL:
//         // mouseWheelDistance = 8 * [currentUserDefs floatForKey:@"com.apple.scrollwheel.scaling"];
//         mask = 3; 
//         {
//             var (dx, dy) = evt.wheelDeltas;
//             if (dx > 0) dx = 1;
//             else if (dx < 0) dx = -1;
//             if (dy > 0) dy = 1;
//             else if (dy < 0) dy = -1;
//             if (Math.abs(dx) > Math.abs(dy)) {
//                 dy = 0;
//             } else {
//                 dx = 0;
//             }
//             acc_wheel_delta_x += dx;
//             acc_wheel_delta_y += dy;
//             wheel_delta_x = acc_wheel_delta_x.toInteger();
//             wheel_delta_y = acc_wheel_delta_y.toInteger();
//             acc_wheel_delta_x -= wheel_delta_x;
//             acc_wheel_delta_y -= wheel_delta_y;
//             var now = getTime();
//             var dt = last_wheel_time > 0 ? (now - last_wheel_time) / 1000 : 0;
//             if (dt > 0) {
//                 var vx = dx / dt;
//                 var vy = dy / dt;
//                 if (vx != 0 || vy != 0) {
//                     inertia_velocity_x = vx;
//                     inertia_velocity_y = vy;
//                 }
//             }
//             acc_wheel_delta_x0 += dx;
//             acc_wheel_delta_y0 += dy;
//             total_wheel_time += dt;
//             if (dx == 0 && dy == 0) {
//                 wheeling = false;
//                 if (dt < 0.1 && total_wheel_time > 0) {
//                     var v2 = (acc_wheel_delta_y0 / total_wheel_time) * inertia_velocity_y;
//                     if (v2 > 0) {
//                         v2 = Math.sqrt(v2);
//                         inertia_velocity_y = inertia_velocity_y < 0 ? -v2  : v2;
//                         accWheel(inertia_velocity_y, false);
//                     }
//                     v2 = (acc_wheel_delta_x0 / total_wheel_time) * inertia_velocity_x;
//                     if (v2 > 0) {
//                         v2 = Math.sqrt(v2);
//                         inertia_velocity_x = inertia_velocity_x < 0 ? -v2  : v2;
//                         accWheel(inertia_velocity_x, true);
//                     }
//                 }
//                 resetWheel();
//             } else {
//                 wheeling = true;
//             }
//             last_wheel_time = now;
//             if (wheel_delta_x == 0 && wheel_delta_y == 0) return keyboard_enabled;
//         }
//         break;
//       case Event.MOUSE_DCLICK: // seq: down, up, dclick, up
//         mask = 1;
//         break;
//       case Event.MOUSE_ENTER:
//         entered = true;
//         console.log("enter");
//         return keyboard_enabled;
//       case Event.MOUSE_LEAVE:
//         entered = false;
//         console.log("leave");
//         return keyboard_enabled;
//       default:
//         return false;
//     }
//     var x = evt.x;
//     var y = evt.y;
//     if (mask != 0) {
//         // to gain control of the mouse, user must move mouse
//         if (cur_x != x || cur_y != y) {
//             return keyboard_enabled;
//         }
//         // save bandwidth
//         x = 0;
//         y = 0;
//     } else {
//         cur_local_x = cur_x = x;
//         cur_local_y = cur_y = y;
//     }
//     if (mask != 3) {
//         resetWheel();
//     }
//     if (!keyboard_enabled) return false;
//     x = (x / display_scale).toInteger();
//     y = (y / display_scale).toInteger();
//     // insert down between two up, osx has this behavior for triple click
//     if (last_mouse_mask == 2 && mask == 2) {
//         handler.send_mouse((evt.buttons << 3) | 1, x + display_origin_x, y + display_origin_y, evt.altKey,
//                 evt.ctrlKey, evt.shiftKey, evt.commandKey);
//     }
//     last_mouse_mask = mask;
//     // to-do: altKey, ctrlKey etc
//     handler.send_mouse((evt.buttons << 3) | mask,
//                 mask == 3 ? wheel_delta_x : x + display_origin_x,
//                 mask == 3 ? wheel_delta_y : y + display_origin_y,
//                 evt.altKey,
//                 evt.ctrlKey, evt.shiftKey, evt.commandKey);
//     return true;
// };

var cur_hotx = 0;
var cur_hoty = 0;
var cur_img = null;
var cur_x = 0;
var cur_y = 0;
var cur_local_x = 0;
var cur_local_y = 0;
var cursors = {};
var image_binded;

handler.setCursorData = function(id, hotx, hoty, width, height, colors) {
    cur_hotx = hotx;
    cur_hoty = hoty;
    cursor_img.style.setProperty("width",width + "px");
    cursor_img.style.setProperty("height",height + "px");

    let img = Image.fromBytes(colors);
    if (img) {
        image_binded = true;
        cursors[id] = [img, hotx, hoty, width, height];
        this.bindImage("in-memory:cursor", img);
        if (cursor_img.style.getProperty("display") == 'none') { // TEST getProperty
            setTimeout(function() { handler.style.cursor(cur_img, cur_hotx, cur_hoty) },1); // TODO cursor
        }
        cur_img = img;
    }
}

handler.setCursorId = function(id) {
    let img = cursors[id];
    if (img) {
        image_binded = true;
        cur_hotx = img[1];
        cur_hoty = img[2];
        cursor_img.style.setProperty("width",img[3] + "px");
        cursor_img.style.setProperty("height",img[4] + "px");
        img = img[0];
        this.bindImage("in-memory:cursor", img);
        if (cursor_img.style.getProperty("display") == 'none') {
            setTimeout(function() { handler.style.cursor(cur_img, cur_hotx, cur_hoty) },1);
        }
        cur_img = img;
    }
}

var got_mouse_control = true;
handler.setCursorPosition = function(x, y) {
    if (!image_binded) return;
    got_mouse_control = false;
    cur_x = x - display_origin_x;
    cur_y = y - display_origin_y;
    var x = cur_x - cur_hotx;
    var y = cur_y - cur_hoty;
    x *= display_scale;
    y *= display_scale;
    cursor_img.style.setProperty("width",x + "px");
    cursor_img.style.setProperty("width",y + "px");
    if (cursor_img.style.getProperty("display") == 'none') {
        handler.style.setProperty("cursor",'none');
        cursor_img.style.setProperty("display","block");
    }
}

document.on("ready",()=> {
    let w = 960;
    let h = 640;
    if (handler.is_file_transfer || handler.is_port_forward) {
        let r = handler.xcall("get_size");
        if (isReasonableSize(r) && r[2] > 0) {
            view.move(r[0], r[1], r[2], r[3]);
        } else {
            centerize(w, h);
        }
    } else {
        centerize(w, h);
    }
    if (!handler.is_port_forward) connecting();
    if (handler.is_file_transfer) initializeFileTransfer();
    if (handler.is_port_forward) initializePortForward();
})

var workarea_offset = 0;
var size_adapted;
handler.adaptSize = function() {
    if (size_adapted) return;
    size_adapted = true;
    let [sx, sy, sw, sh] = view.screenBox("workarea", "rectw");
    let [fx, fy, fw, fh] = view.screenBox("frame", "rectw");
    if (is_osx) workarea_offset = sy;
    let r = handler.xcall("get_size");
    if (isReasonableSize(r) && r[2] > 0) {
        if (r[2] >= fw && r[3] >= fh && !is_linux) {
            view.state = Window.WINDOW_FULL_SCREEN;
            console.log("Initialize to full screen");
        } else if (r[2] >= sw && r[3] >= sh) {
            view.state = Window.WINDOW_MAXIMIZED;
            console.log("Initialize to full screen");
        } else {
            view.move(r[0], r[1], r[2], r[3]);
        }
    } else {
        let w = handler.state.box("width", "border")
        let h = handler.state.box("height", "border")
        if (w >= sw || h >= sh) {
            view.state = Window.WINDOW_MAXIMIZED;
            return;
        }
        // extra for border
        let extra = 2;
        centerize(w + extra, handler.state.box("height", "border") + h + extra);
    }
}

document.on("unloadequest",()=> {
    let [x, y, w, h] = body.state.box("rectw", "border", "screen");
    console.log("remote.js unloadequest",x, y, w, h)
    if (handler.is_file_transfer) save_file_transfer_close_state();
    if (handler.is_file_transfer || handler.is_port_forward || size_adapted) handler.xcall("save_size",x, y, w, h);
})

handler.setPermission = function(name, enabled) {
    if (name == "keyboard") keyboard_enabled = enabled;
    if (name == "audio") audio_enabled = enabled;
    if (name == "clipboard") clipboard_enabled = enabled;
    header.componentUpdate();
}

// TODO
handler.closeSuccess = function() {
    // handler.msgbox("success", "Successful", "Ready to go.");
    console.log("remote.js handler.closeSuccess");
    handler.msgbox("", "", "");
}
