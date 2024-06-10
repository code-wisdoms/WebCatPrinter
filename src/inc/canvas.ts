export const registerFont = (path: string, name: string) => {
    const style = document.createElement('style');
    style.appendChild(document.createTextNode(`
                @font-face {
                    font-family: '${name}';
                    src: url('${path}');
                }
            `));
    document.head.appendChild(style);
}
export const createCanvas = (width: number, height: number): HTMLCanvasElement => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    document.appendChild(canvas);
    return canvas;
}
export const loadImage = (src: string): Promise<ImageBitmap> => {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            createImageBitmap(img)
                .then((imageBitmap) => resolve(imageBitmap))
                .catch((err) => reject(err));
        };
        img.onerror = (err) => reject(err);
        img.src = src;
    });
}